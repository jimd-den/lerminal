import { Card } from "./card";

/**
 * Single fill-in-the-blank deletion target.
 */
export interface ClozeBlank {
  /** Unique placeholder identifier (e.g. "c1", "c2"). */
  id: string;
  /** Primary correct answer text. */
  answer: string;
  /** Optional array of acceptable synonym/alternative answers. */
  acceptedAnswers?: string[];
}

/**
 * Structured card fields for cloze cards stored on `Card.fields`.
 */
export interface ClozeCardFields {
  /** Template string containing {{c1}}, {{c2}} placeholders. */
  template: string;
  /** JSON array of ClozeBlank objects. */
  blanks: ClozeBlank[];
}

/**
 * Result structure produced by cloze card generation (`makeCloze`).
 */
export interface ClozeResult {
  template: string;
  blanks: ClozeBlank[];
  fullAnswer: string;
}

/**
 * Parsed data structure for rendering inline cloze cards in the UI.
 */
export interface ClozeCardData {
  template: string;
  blanks: ClozeBlank[];
  fullAnswer: string;
  isLegacy?: boolean;
}

export type ClozePart =
  | { kind: "text"; value: string }
  | { kind: "blank"; id: string };

/**
 * # Cloze Template Parser
 *
 * ## Business Value & Purpose
 * Splits a template string (e.g. `"The {{c1}} uses a {{c2}} buffer."`) into an ordered
 * array of text and blank tokens for inline component rendering.
 */
export function parseClozeTemplate(template: string): ClozePart[] {
  return template
    .split(/(\{\{c\d+\}\})/)
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^\{\{(c\d+)\}\}$/);
      return match
        ? { kind: "blank", id: match[1] }
        : { kind: "text", value: part };
    });
}

/**
 * # Answer Normalizer
 *
 * ## Business Value & Purpose
 * Normalizes user input and expected answers for soft, deterministic matching:
 * trims, lowercases, removes punctuation, and compresses multi-space gaps.
 */
export function normalizeAnswer(text: string): string {
  return text
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-");
}

/**
 * # Answer Matcher
 *
 * ## Business Value & Purpose
 * Evaluates whether a user's typed string matches a specific blank's primary or accepted answers.
 */
export function answerMatches(typed: string, blank: ClozeBlank): boolean {
  if (!typed || !typed.trim()) return false;
  const candidates = [blank.answer, ...(blank.acceptedAnswers ?? [])];
  const normalizedTyped = normalizeAnswer(typed);
  return candidates.some(candidate => normalizeAnswer(candidate) === normalizedTyped);
}

/**
 * # Cloze Card Detector
 *
 * ## Business Value & Purpose
 * Determines whether a given card is a fill-in-the-blank cloze card regardless of whether
 * its base `type` string is "question" or "cloze".
 */
export function isClozeCard(card: Card): boolean {
  if (!card) return false;
  if (card.typeId) return card.typeId === "cloze";
  return (
    card.type === "cloze" ||
    !!card.fields?.template ||
    !!card.fields?.blanks ||
    (card.type === "question" && typeof card.title === "string" && card.title.includes("_____"))
  );
}

/**
 * # Cloze Card Reader
 *
 * ## Business Value & Purpose
 * Converts a Card entity into ClozeCardData. Handles structured `fields.template` and `fields.blanks`
 * for modern cloze cards, while providing a backwards-compatible fallback for legacy comma-separated cards.
 */
export function readClozeCard(card: Card): ClozeCardData {
  const template = card.fields?.template;
  const rawBlanks = card.fields?.blanks;

  if (template && rawBlanks) {
    try {
      const blanks: ClozeBlank[] = JSON.parse(rawBlanks);
      if (Array.isArray(blanks) && blanks.length > 0) {
        return {
          template,
          blanks,
          fullAnswer: card.answer ?? "",
          isLegacy: false,
        };
      }
    } catch {
      // Fallback to legacy reader
    }
  }

  // Legacy fallback: convert blanked title and comma-separated answer into structured template & blanks
  const legacyAnswers = (card.answer || "").split(",").map(s => s.trim()).filter(Boolean);
  const titleText = card.title || "";
  
  let blankCount = 0;
  const legacyTemplate = titleText.replace(/_____/g, () => {
    blankCount++;
    return `{{c${blankCount}}}`;
  });

  const legacyBlanks: ClozeBlank[] = legacyAnswers.map((ans, idx) => ({
    id: `c${idx + 1}`,
    answer: ans,
  }));

  return {
    template: legacyTemplate || titleText,
    blanks: legacyBlanks.length > 0 ? legacyBlanks : [{ id: "c1", answer: card.answer || "" }],
    fullAnswer: card.answer || "",
    isLegacy: true,
  };
}
