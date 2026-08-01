import {
  FontCategory,
  FontFamilySummary,
  FontFormat,
} from "../../entities/fontCatalog";
import {
  FontGateway,
  ResolveFontOptions,
  ResolvedFontFile,
} from "../../usecases/ports/gateways/FontGateway";

/**
 * # Google Fonts Gateway
 *
 * ## Business Value & Purpose
 * Turns a family name into a downloadable font file, and the whole Google Fonts library
 * into a searchable catalog — using only public endpoints, so there is no API key, no
 * account, and nothing for the user to configure.
 *
 * ## Content negotiation, and the bug it caused
 * `fonts.googleapis.com/css2` serves a different file format depending on the request's
 * `User-Agent`. This gateway used to announce MSIE 6 on the theory that ancient browsers
 * get TrueType. That stopped being true: Google now answers MSIE 6 with **EOT**
 * (Embedded OpenType) at an extensionless `/l/font?kit=…` URL, which React Native cannot
 * load and which the old `.ttf`-suffix check rejected — so every single font install
 * failed with "no downloadable TrueType file".
 *
 * An early-Android UA is served genuine TrueType, verified across static, variable, and
 * icon families. That is the trick now, and {@link FONT_FORMAT_USER_AGENTS} is the one
 * part of this file that will break if Google changes negotiation again — hence the
 * explicit format check and a clear error rather than a silent, unrenderable install.
 */

/**
 * User agents that elicit each format, tried in the caller's order of preference.
 *
 * Deliberately explicit rather than clever: the mapping is empirical, and a comment naming
 * what each string is pretending to be is worth more than a derivation.
 */
const FONT_FORMAT_USER_AGENTS: Partial<Record<FontFormat, string>> = {
  // Android 2.2 / WebKit 533 — served static TrueType, the format RN loads natively.
  truetype:
    "Mozilla/5.0 (Linux; U; Android 2.2; en-us; Nexus One Build/FRF91) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1",
  // Modern Chrome — served WOFF2. Web only; RN cannot load it.
  woff2:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  // Android 4.3 / Chrome 30 — the WOFF era.
  woff: "Mozilla/5.0 (Linux; Android 4.3; Nexus 7 Build/JSS15Q) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/30.0.0.0 Safari/537.36",
};

const CSS_ENDPOINT = "https://fonts.googleapis.com/css2";

/**
 * The catalog the Google Fonts website itself uses. Public and key-less, but not a
 * documented API — {@link parseFontCatalog} is therefore defensive about every field.
 */
const METADATA_ENDPOINT = "https://fonts.google.com/metadata/fonts";

/** Google prefixes the metadata JSON with an anti-JSON-hijacking guard. */
const JSON_GUARD = /^\)\]\}'/;

export class GoogleFontsGateway implements FontGateway {
  /**
   * The catalog is ~2.7 MB and changes on the order of weeks, so it is fetched at most
   * once per app session. Cached as the in-flight promise, not the result, so several
   * keystrokes racing to open the picker share one download instead of starting four.
   */
  private catalog: Promise<FontFamilySummary[]> | null = null;

  async listFamilies(): Promise<FontFamilySummary[]> {
    if (!this.catalog) {
      this.catalog = this.fetchCatalog().catch(err => {
        // A failed fetch must not poison the cache — the next search should retry.
        this.catalog = null;
        throw err;
      });
    }
    return this.catalog;
  }

  async resolveFont(
    family: string,
    options: ResolveFontOptions
  ): Promise<ResolvedFontFile> {
    const trimmed = family.trim();
    if (!trimmed) {
      throw new Error("Enter a font family name");
    }

    const accepted = options.acceptedFormats.filter(
      format => FONT_FORMAT_USER_AGENTS[format]
    );
    if (accepted.length === 0) {
      throw new Error("No supported font format was requested");
    }

    // Ask for the caller's preferred format first and stop at the first real hit, so a
    // native caller pays for one request in the normal case.
    const offered: FontFormat[] = [];
    for (const format of accepted) {
      const css = await this.fetchCss(trimmed, FONT_FORMAT_USER_AGENTS[format]!);
      const match = selectFontSource(css, accepted);
      if (match) return { family: trimmed, uri: match.uri, format: match.format };
      offered.push(...describeOfferedFormats(css));
    }

    const seen = [...new Set(offered)];
    throw new Error(
      seen.length > 0
        ? `"${trimmed}" is only offered as ${seen.join(", ")}, which this device can't load`
        : `"${trimmed}" has no downloadable font file`
    );
  }

  private async fetchCss(family: string, userAgent: string): Promise<string> {
    // Google expects "+" for spaces, e.g. JetBrains+Mono.
    const query = encodeURIComponent(family).replace(/%20/g, "+");
    const url = `${CSS_ENDPOINT}?family=${query}&display=swap`;

    let response: Response;
    try {
      response = await fetch(url, { headers: { "User-Agent": userAgent } });
    } catch (err: any) {
      throw new Error(`Couldn't reach Google Fonts: ${err?.message ?? "network error"}`);
    }

    if (response.status === 400) {
      // Google answers an unknown family with a 400 — the most common real failure.
      throw new Error(`Google Fonts has no family called "${family}"`);
    }
    if (!response.ok) {
      throw new Error(`Google Fonts returned ${response.status}`);
    }
    return response.text();
  }

  private async fetchCatalog(): Promise<FontFamilySummary[]> {
    let response: Response;
    try {
      response = await fetch(METADATA_ENDPOINT);
    } catch (err: any) {
      throw new Error(
        `Couldn't reach Google Fonts: ${err?.message ?? "network error"}`
      );
    }
    if (!response.ok) {
      throw new Error(`Google Fonts returned ${response.status}`);
    }
    return parseFontCatalog(await response.text());
  }
}

/** A font file offered by a stylesheet, with the format it was declared as. */
export interface FontSource {
  uri: string;
  format: FontFormat;
}

/**
 * Picks the best acceptable file out of a Google Fonts stylesheet.
 *
 * Google returns one `@font-face` per unicode subset, so a single stylesheet can offer a
 * dozen identical-format files; the first is the right one for a preview or a UI face.
 * Selection is by *declared* format, falling back to the URL extension, because the
 * modern `/l/font?kit=…` URLs carry no extension at all — the mistake that made the old
 * suffix-only check reject every font.
 */
export function selectFontSource(
  css: string,
  acceptedFormats: FontFormat[]
): FontSource | null {
  const sources = parseFontSources(css);
  for (const format of acceptedFormats) {
    const match = sources.find(source => source.format === format);
    if (match) return match;
  }
  return null;
}

/** Every `url(...)` in the stylesheet whose format could be established. */
export function parseFontSources(css: string): FontSource[] {
  const pattern = /url\((https:\/\/[^)]+?)\)(?:\s*format\(['"]?([a-z0-9-]+)['"]?\))?/gi;
  const sources: FontSource[] = [];
  for (const match of css.matchAll(pattern)) {
    const uri = match[1];
    const format = normalizeFormat(match[2]) ?? formatFromExtension(uri);
    if (format) sources.push({ uri, format });
  }
  return sources;
}

/** Formats a stylesheet offered, for an error message that says what went wrong. */
function describeOfferedFormats(css: string): FontFormat[] {
  return parseFontSources(css).map(source => source.format);
}

function normalizeFormat(raw: string | undefined): FontFormat | null {
  switch (raw?.toLowerCase()) {
    case "truetype":
    case "ttf":
      return "truetype";
    case "opentype":
    case "otf":
      return "opentype";
    case "woff2":
      return "woff2";
    case "woff":
      return "woff";
    case "embedded-opentype":
    case "eot":
      return "embedded-opentype";
    default:
      return null;
  }
}

function formatFromExtension(uri: string): FontFormat | null {
  const path = uri.split("?")[0].toLowerCase();
  if (path.endsWith(".ttf")) return "truetype";
  if (path.endsWith(".otf")) return "opentype";
  if (path.endsWith(".woff2")) return "woff2";
  if (path.endsWith(".woff")) return "woff";
  if (path.endsWith(".eot")) return "embedded-opentype";
  return null;
}

const CATEGORIES = new Set<string>([
  "Sans Serif",
  "Serif",
  "Display",
  "Handwriting",
  "Monospace",
]);

/**
 * Parses the metadata payload into catalog entries.
 *
 * Tolerant by design: this is an undocumented endpoint, so an entry missing a field is
 * skipped or defaulted rather than allowed to throw and take the whole picker down with
 * it. A partial catalog is a usable font browser; an exception is a blank screen.
 */
export function parseFontCatalog(payload: string): FontFamilySummary[] {
  const json = payload.replace(JSON_GUARD, "").trim();

  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Google Fonts returned an unreadable catalog");
  }

  const list = parsed?.familyMetadataList;
  if (!Array.isArray(list)) {
    throw new Error("Google Fonts returned an unreadable catalog");
  }

  const families: FontFamilySummary[] = [];
  list.forEach((entry: any, index: number) => {
    const family = typeof entry?.family === "string" ? entry.family.trim() : "";
    if (!family) return;

    families.push({
      family,
      category: CATEGORIES.has(entry?.category)
        ? (entry.category as FontCategory)
        : "Sans Serif",
      // Fall back to catalog order so a missing rank sorts late but stays stable.
      popularity:
        typeof entry?.popularity === "number" ? entry.popularity : index + 1,
      designers: Array.isArray(entry?.designers)
        ? entry.designers.filter((d: unknown) => typeof d === "string")
        : [],
      axes: Array.isArray(entry?.axes)
        ? entry.axes
            .map((axis: any) => axis?.tag)
            .filter((tag: unknown): tag is string => typeof tag === "string")
        : [],
    });
  });

  return families;
}
