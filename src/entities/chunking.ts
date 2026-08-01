import { Card, createCard } from "./card";

/**
 * # Chunking
 *
 * ## Business Value & Purpose
 * Turns a long passage into screen-sized ideas. Reading dense paragraphs on a phone
 * produces fatigue rather than learning, and a card that doesn't fit on screen is a card
 * that doesn't get reviewed. This is a pure transformation on card content — no model,
 * no storage — which is why it lives in the domain: the same rules apply whoever calls it.
 */

/** Fragments shorter than this are punctuation or stray words, not ideas. */
const MIN_BLOCK_LENGTH = 12;

/** A run produces at most this many chunks, so one paste can't bury the workspace. */
const MAX_CHUNKS = 6;

/** How much of the parent's title each chunk carries as its prefix. */
const TITLE_PREFIX_LENGTH = 30;

/**
 * Splits on blank lines rather than sentences, which keeps Markdown lists, code blocks,
 * and paragraphs intact — single-newline splitting tears bullet points apart.
 */
function splitIntoBlocks(body: string): string[] {
  const blocks = body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > MIN_BLOCK_LENGTH);

  // A body with no blank lines is still one idea worth keeping.
  return blocks.length > 0 ? blocks : [body];
}

/**
 * Chunks a long card into smaller ones, each citing the original so provenance survives
 * the split.
 */
export function chunkCard(card: Card): Card[] {
  const parentTitle = card.title.substring(0, TITLE_PREFIX_LENGTH);

  return splitIntoBlocks(card.body)
    .slice(0, MAX_CHUNKS)
    .map((paragraph, index) =>
      createCard({
        workspaceId: card.workspaceId,
        type: "chunk",
        title: `${parentTitle} · ${index + 1}`,
        body: paragraph,
        sourceRef: card.sourceRef || card.id,
        cite: card.cite,
      }),
    );
}
