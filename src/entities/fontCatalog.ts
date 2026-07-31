/**
 * # Font Catalog — finding a typeface you can't name
 *
 * ## Business Value & Purpose
 * The old install flow asked the user to type an exact family name. That only works if you
 * already know that the font you want is called "Cormorant Garamond" — which is precisely
 * the knowledge a person choosing a font by *look* does not have. This module is the
 * domain half of the fix: a browsable catalog of families plus a forgiving match that
 * turns "garamnd", "mono", or "hand writing" into a shortlist worth previewing.
 *
 * ## Why the ranking lives in entities
 * Matching a query to a family name is a pure decision about text — no network, no
 * platform, no rendering. Keeping it here means the search behaviour is unit-testable
 * without touching Google, and the gateway is left with the one job it can't avoid:
 * fetching bytes.
 */

/** How a family is classified by the provider. Used to filter and to label results. */
export type FontCategory =
  | "Sans Serif"
  | "Serif"
  | "Display"
  | "Handwriting"
  | "Monospace";

export const FONT_CATEGORIES: FontCategory[] = [
  "Sans Serif",
  "Serif",
  "Display",
  "Handwriting",
  "Monospace",
];

/**
 * A font file container format.
 *
 * The distinction matters because it decides whether a download can actually be rendered:
 * React Native's native font loading accepts `truetype` and `opentype` only. `woff`,
 * `woff2`, and `embedded-opentype` are web-only and, if installed, produce a family that
 * silently falls back to the system face — or blank rectangles.
 */
export type FontFormat =
  | "truetype"
  | "opentype"
  | "woff2"
  | "woff"
  | "embedded-opentype";

/** Formats a React Native app can load natively, best first. */
export const NATIVE_FONT_FORMATS: FontFormat[] = ["truetype", "opentype"];

/** Formats a browser can load, best first — used when the app runs on web. */
export const WEB_FONT_FORMATS: FontFormat[] = [
  "woff2",
  "woff",
  "truetype",
  "opentype",
];

/** One family as offered by the provider, reduced to what the picker actually shows. */
export interface FontFamilySummary {
  /** The canonical family name, e.g. `JetBrains Mono`. */
  family: string;
  category: FontCategory;
  /** 1 is the most-downloaded family. Used to break ties toward fonts people recognise. */
  popularity: number;
  /** Who drew it — shown because attribution is the honest thing to display. */
  designers: string[];
  /** Variable-font axis tags, when the family has any. */
  axes: string[];
}

/** A family plus the score that put it in the list, so the UI can explain the ordering. */
export interface RankedFontFamily {
  summary: FontFamilySummary;
  score: number;
}

/**
 * Scoring tiers, most specific first. The gaps between tiers are wide enough that a weaker
 * kind of match can never outrank a stronger one on popularity alone: an exact hit for a
 * rare font still beats a substring hit for a famous one.
 */
const TIER_EXACT = 1000;
/**
 * A query that names a *kind* of font rather than a family. Sits above name-prefix so
 * that "mono" lists monospace faces instead of the display family "Monoton", but below an
 * exact name so someone who really does want Monoton can still type it in full.
 */
const TIER_CATEGORY = 900;
const TIER_PREFIX = 800;
const TIER_WORD_PREFIX = 700;
const TIER_SUBSTRING = 600;
const TIER_ALL_TOKENS = 450;
const TIER_SUBSEQUENCE = 300;

/**
 * Words people actually type when they want a *kind* of typeface rather than a named one.
 *
 * Without this, "handwriting" matches nothing at all — no family is called that — and
 * "mono" returns display faces that merely start with those letters. Describing the look
 * you want is the whole reason someone opens a font browser instead of typing a name.
 */
const CATEGORY_ALIASES: Record<string, FontCategory> = {
  mono: "Monospace",
  monospace: "Monospace",
  monospaced: "Monospace",
  code: "Monospace",
  coding: "Monospace",
  terminal: "Monospace",
  fixedwidth: "Monospace",
  hand: "Handwriting",
  handwriting: "Handwriting",
  handwritten: "Handwriting",
  script: "Handwriting",
  cursive: "Handwriting",
  serif: "Serif",
  sans: "Sans Serif",
  sansserif: "Sans Serif",
  display: "Display",
  decorative: "Display",
  title: "Display",
};

/** The category a query is asking for, if it is asking for one at all. */
export function categoryForQuery(query: string): FontCategory | null {
  // Spaces removed so "sans serif", "hand writing", and "fixed width" all land.
  const key = normalize(query).replace(/ /g, "");
  return CATEGORY_ALIASES[key] ?? null;
}

/**
 * Scores one family against a query, or returns `null` when it doesn't match at all.
 *
 * Exported for tests: the tier boundaries are the whole behaviour of the search box, and
 * they deserve to be asserted directly rather than inferred from a result ordering.
 */
export function scoreFontFamily(
  query: string,
  family: string,
  category?: FontCategory
): number | null {
  const nameScore = scoreFamilyName(query, family);

  // A category hit and a name hit are alternative reasons to show a font, so take
  // whichever is stronger rather than letting one veto the other.
  if (category && categoryForQuery(query) === category) {
    return Math.max(nameScore ?? 0, TIER_CATEGORY);
  }
  return nameScore;
}

function scoreFamilyName(query: string, family: string): number | null {
  const needle = normalize(query);
  const hay = normalize(family);
  if (!needle) return 0;

  if (hay === needle) return TIER_EXACT;
  if (hay.startsWith(needle)) return TIER_PREFIX + lengthAffinity(needle, hay);

  const words = hay.split(" ");
  if (words.some(word => word.startsWith(needle))) {
    return TIER_WORD_PREFIX + lengthAffinity(needle, hay);
  }
  if (hay.includes(needle)) return TIER_SUBSTRING + lengthAffinity(needle, hay);

  // "hand writing" should still find "Handwriting", and "mono jetbrains" find
  // "JetBrains Mono" — order and spacing are the user's least reliable input.
  const tokens = needle.split(" ").filter(Boolean);
  if (tokens.length > 1 && tokens.every(token => hay.includes(token))) {
    return TIER_ALL_TOKENS + lengthAffinity(needle, hay);
  }

  // Last resort: tolerate dropped letters ("garamnd"). Requires the characters in order,
  // which keeps it from matching essentially everything the way a bag-of-letters would.
  const compactNeedle = needle.replace(/ /g, "");
  const compactHay = hay.replace(/ /g, "");
  const span = subsequenceSpan(compactNeedle, compactHay);
  if (span === null) return null;

  // A tight span means few dropped letters, so it's a closer typo than a scattered one.
  const tightness = compactNeedle.length / span;
  return TIER_SUBSEQUENCE + tightness * 50;
}

/**
 * Ranks the catalog against a query.
 *
 * An empty query is not an empty result: it lists the most popular families, so opening
 * the picker with nothing typed still shows something worth looking at.
 */
export function rankFontFamilies(
  query: string,
  catalog: FontFamilySummary[],
  options: { limit?: number; category?: FontCategory | null } = {}
): RankedFontFamily[] {
  const { limit = 40, category = null } = options;
  const pool = category
    ? catalog.filter(summary => summary.category === category)
    : catalog;

  const trimmed = query.trim();
  if (!trimmed) {
    return [...pool]
      .sort((a, b) => a.popularity - b.popularity)
      .slice(0, limit)
      .map(summary => ({ summary, score: 0 }));
  }

  const ranked: RankedFontFamily[] = [];
  for (const summary of pool) {
    const score = scoreFontFamily(trimmed, summary.family, summary.category);
    if (score === null) continue;
    ranked.push({ summary, score });
  }

  // Popularity only ever breaks a tie within a tier — see the note on the tier constants.
  ranked.sort(
    (a, b) => b.score - a.score || a.summary.popularity - b.summary.popularity
  );
  return ranked.slice(0, limit);
}

/** Case, punctuation, and stray spacing are noise when someone is guessing at a name. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Prefers the shorter of two families that match equally well, so "Roboto" outranks
 * "Roboto Condensed Italic" for the query "roboto". Capped well below the tier gap.
 */
function lengthAffinity(needle: string, hay: string): number {
  return (needle.length / hay.length) * 50;
}

/**
 * The window of `hay` spanned by a greedy in-order match of `needle`, or `null` if the
 * characters don't all appear in order.
 */
function subsequenceSpan(needle: string, hay: string): number | null {
  let start = -1;
  let cursor = 0;
  for (const char of needle) {
    const found = hay.indexOf(char, cursor);
    if (found === -1) return null;
    if (start === -1) start = found;
    cursor = found + 1;
  }
  return start === -1 ? null : cursor - start;
}
