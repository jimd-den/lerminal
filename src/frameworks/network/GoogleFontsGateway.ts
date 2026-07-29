import { FontGateway, ResolvedFontFile } from "../../adapters/gateways/FontGateway";

/**
 * # Google Fonts Gateway
 *
 * ## Business Value & Purpose
 * Turns a family name into a downloadable font file using the public Google Fonts CSS
 * endpoint — no API key, no account, nothing for the user to configure. This is what
 * makes "download a font in settings" a two-tap action instead of a build step.
 *
 * ## How it works
 * `fonts.googleapis.com/css2` returns a stylesheet whose `@font-face` blocks point at
 * real font files. Which files you get depends on the `User-Agent`: modern browsers are
 * served `woff2`, which React Native cannot load. Announcing an old user agent gets plain
 * `truetype` back, which it can. That's the whole trick, and it's the one piece of this
 * file that will break if Google changes their content negotiation — hence the explicit
 * check for a `.ttf` URL and a clear error rather than a silent failure.
 */

/** An ancient UA string: Google serves it TTF rather than WOFF2, which RN can actually load. */
const TTF_USER_AGENT = "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)";

const CSS_ENDPOINT = "https://fonts.googleapis.com/css2";

export class GoogleFontsGateway implements FontGateway {
  async resolveFont(family: string): Promise<ResolvedFontFile> {
    const trimmed = family.trim();
    if (!trimmed) {
      throw new Error("Enter a font family name");
    }

    // Google expects "+" for spaces, e.g. JetBrains+Mono.
    const query = encodeURIComponent(trimmed).replace(/%20/g, "+");
    const url = `${CSS_ENDPOINT}?family=${query}&display=swap`;

    let response: Response;
    try {
      response = await fetch(url, { headers: { "User-Agent": TTF_USER_AGENT } });
    } catch (err: any) {
      throw new Error(`Couldn't reach Google Fonts: ${err?.message ?? "network error"}`);
    }

    if (response.status === 400) {
      // Google answers an unknown family with a 400 — the most common real failure.
      throw new Error(`Google Fonts has no family called "${trimmed}"`);
    }
    if (!response.ok) {
      throw new Error(`Google Fonts returned ${response.status}`);
    }

    const css = await response.text();
    const uri = firstTruetypeUrl(css);
    if (!uri) {
      throw new Error(`"${trimmed}" has no downloadable TrueType file`);
    }

    return { family: trimmed, uri };
  }
}

/**
 * Pulls the first `.ttf` out of the stylesheet. Deliberately strict: a `woff2` URL would
 * download happily and then fail to render, so a missing TTF is treated as "unavailable"
 * rather than passed along to fail later somewhere less explicable.
 */
export function firstTruetypeUrl(css: string): string | null {
  const matches = css.matchAll(/url\((https:\/\/[^)]+?)\)/g);
  for (const match of matches) {
    const candidate = match[1];
    if (candidate.endsWith(".ttf")) return candidate;
  }
  return null;
}
