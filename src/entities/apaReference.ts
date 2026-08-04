/**
 * # APA Reference
 *
 * ## Business Value & Purpose
 * A single source, formatted APA-style, attached to a card a model wrote. Cards are read
 * weeks later with none of the conversation around them, so "where did this claim come
 * from?" has to travel with the card itself rather than living in a chat log.
 *
 * ## Why a formatted string rather than parsed fields
 * The app never re-renders these into another citation style, so storing author/year/title
 * separately would buy nothing and add a parser that could disagree with what the model
 * actually meant. The `text` is the reference as it should be displayed; `url` is split out
 * only because it has to be tappable.
 *
 * ## The honesty constraint
 * A reference the model made up is worse than no reference: it looks like a receipt and is
 * not one. The prompt contract that produces these (see `promptPreset.ts`) therefore
 * permits an empty list, and permits a reference with no URL when the model knows the work
 * but not the address. Nothing in the app should present an absent reference as a failure —
 * see [[griot-never-gatekeep]] for the same principle applied to content.
 */
export interface ApaReference {
  /**
   * The reference as APA would print it, e.g.
   * `Bjork, R. A. (1994). Memory and metamemory considerations in the training of human
   * beings. In Metacognition (pp. 185–205). MIT Press.`
   * Includes the URL at the end when there is one, as APA requires.
   */
  text: string;
  /** The URL, repeated on its own so the UI can make it tappable. Absent when unknown. */
  url?: string;
}

/** Longest reference we keep. Real APA entries run well under this; the cap is anti-abuse. */
const MAX_REFERENCE_LENGTH = 400;
/** Most references one card can carry. Past this it is a bibliography, not a card. */
const MAX_REFERENCES = 6;

/**
 * Normalises whatever a model returned in the `references` field into references we are
 * willing to display.
 *
 * Anything unrecognisable is dropped rather than coerced: an entry we cannot read is not
 * evidence of anything, and showing a mangled one would misrepresent the model's answer.
 * A URL is kept only when it parses as http(s), because a tappable link that goes nowhere
 * is the exact failure this type exists to avoid.
 */
export function parseApaReferences(raw: unknown): ApaReference[] {
  if (!Array.isArray(raw)) return [];
  const parsed: ApaReference[] = [];
  for (const entry of raw) {
    const source =
      typeof entry === "string" ? { text: entry } : (entry as Record<string, unknown>);
    if (!source || typeof source !== "object") continue;
    const text = typeof source.text === "string" ? source.text.trim() : "";
    if (!text) continue;
    const url = typeof source.url === "string" ? source.url.trim() : "";
    parsed.push({
      text: text.substring(0, MAX_REFERENCE_LENGTH),
      ...(isDisplayableUrl(url) ? { url } : {}),
    });
    if (parsed.length >= MAX_REFERENCES) break;
  }
  return parsed;
}

function isDisplayableUrl(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url);
}
