import { Card, createCard } from "../entities/card";

/**
 * # Command Domain Use Cases
 * 
 * ## Business Value & Purpose
 * This module defines the application logic for the core learning tools in Learnimal:
 * - **Chunking (`chunk`)**: Breaking down verbose source materials into digestible, screen-sized ideas.
 *   Reading long paragraphs on mobile leads to cognitive fatigue. Restricting cards to atomic
 *   concepts matches the visual constraints and cognitive load limits of mobile users.
 * - **Active Recall (`recall`)**: Converting raw facts into interactive questions. Retrieving
 *   answers from memory creates stronger, more durable neural connections than passive re-reading.
 */

/**
 * Heuristically generates a question for active recall based on the contents and title of a card.
 * Uses semantic regex matching to choose the most engaging question format (Why, How, What, etc.).
 * 
 * @param body The description or text content of the card.
 * @param title The main header of the card.
 * @returns A formulated question string.
 */
export function makeQuestion(body: string, title: string): string {
  const text = body.trim();
  // Strip any sequence numbers (e.g. "React · 1" -> "React")
  const subject = title.replace(/·.*$/, "").trim();
  
  if (/because|matters/i.test(text)) {
    return `Why does ${subject.toLowerCase()} matter?`;
  }
  if (/break|parts|works|by/i.test(text)) {
    return `How does ${subject.toLowerCase()} work?`;
  }
  if (/mistake|confuse|error/i.test(text)) {
    return `What’s the common mistake with ${subject.toLowerCase()}?`;
  }
  return `Recall: ${subject}`;
}

/**
 * Chunks a long text card (source or note) into a collection of smaller cards.
 * Uses a sentence-splitting lookbehind regex to respect punctuation boundaries.
 * 
 * @param card The source card to split.
 * @returns An array of generated chunk cards.
 */
export function chunkCard(card: Card): Card[] {
  const logTimestamp = new Date().toISOString();
  
  // Split by double line breaks to preserve Markdown paragraphs, lists, and code blocks.
  // This prevents tearing apart bullet points or code snippets like single-newline splitting does.
  const blocks = card.body
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 12); // Ignore empty or trivially short fragments

  const itemsToCreate = blocks.length > 0 ? blocks : [card.body];
  
  const results = itemsToCreate.slice(0, 6).map((paragraph, index) => {
    const parentTitle = card.title.substring(0, 30);
    return createCard({
      workspaceId: card.workspaceId,
      type: "chunk",
      title: `${parentTitle} · ${index + 1}`,
      body: paragraph,
      sourceRef: card.sourceRef || card.id,
      cite: card.cite,
    });
  });

  console.log(`[${logTimestamp}] [chunkCard] INPUT: cardId=${card.id} | OUTPUT: generated ${results.length} chunks`);
  return results;
}

/** Common words never worth blanking in a cloze deletion. */
const CLOZE_STOPWORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "their", "there", "which",
  "while", "where", "these", "those", "into", "about", "would", "could", "should",
  "because", "between", "through", "however", "therefore",
]);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a cloze-deletion (fill-in-the-blank) prompt from a passage by blanking its
 * most salient terms — proper nouns, numbers, and long content words. Active recall of
 * a deleted term is a science-backed retrieval-practice technique.
 *
 * @param source The passage to turn into a cloze.
 * @returns `{ prompt, answer }` where `prompt` has blanks and `answer` lists the
 *   removed terms, or `null` when the text is too short to make a useful cloze.
 */
export function makeCloze(source: string): { prompt: string; answer: string } | null {
  const text = source.trim().replace(/\s+/g, " ");
  if (text.length < 12) return null;

  const snippet = text.length > 220 ? text.slice(0, 220).trimEnd() + "…" : text;
  const words = snippet.match(/[A-Za-z0-9][A-Za-z0-9'’\-]*/g) || [];

  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const w of words) {
    const key = w.toLowerCase();
    if (seen.has(key) || CLOZE_STOPWORDS.has(key)) continue;
    const salient = /^[A-Z]/.test(w) || /\d/.test(w) || w.length >= 7;
    if (salient) {
      candidates.push(w);
      seen.add(key);
    }
  }

  let blanks = candidates.slice(0, 3);
  if (blanks.length === 0) {
    const longest = [...words].sort((a, b) => b.length - a.length)[0];
    if (!longest) return null;
    blanks = [longest];
  }

  let prompt = snippet;
  for (const term of blanks) {
    prompt = prompt.replace(new RegExp(`\\b${escapeRegExp(term)}\\b`), "_____");
  }
  return { prompt, answer: blanks.join(", ") };
}

/**
 * Transforms a content card (chunk or source) into an active recall question card.
 *
 * @param card The input card containing the facts.
 * @returns A new question card with the hidden answer set to the input card's content.
 */
export function recallCard(card: Card): Card {
  const logTimestamp = new Date().toISOString();
  const questionTitle = makeQuestion(card.body, card.title);

  const result = createCard({
    workspaceId: card.workspaceId,
    type: "question",
    title: questionTitle,
    body: "", // Questions hide details, so body is empty
    answer: card.body, // The facts become the hidden answer key
    sourceRef: card.id,
    cite: card.cite,
  });

  console.log(`[${logTimestamp}] [recallCard] INPUT: cardId=${card.id} | OUTPUT: questionCardId=${result.id}`);
  return result;
}
