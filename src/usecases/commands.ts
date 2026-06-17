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
  
  // Split by sentence endings (.?! followed by spaces) or line breaks
  const sentences = card.body
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 12); // Ignore very short fragments

  const itemsToCreate = sentences.length > 0 ? sentences : [card.body];
  
  // Limit to a maximum of 6 chunks per card for mobile visibility limits
  const results = itemsToCreate.slice(0, 6).map((paragraph, index) => {
    const parentTitle = card.title.substring(0, 30);
    return createCard({
      workspaceId: card.workspaceId,
      type: "chunk",
      title: `${parentTitle} · ${index + 1}`,
      body: paragraph,
      sourceRef: card.id,
      cite: card.cite,
    });
  });

  console.log(`[${logTimestamp}] [chunkCard] INPUT: cardId=${card.id} | OUTPUT: generated ${results.length} chunks`);
  return results;
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
