import { Card, createCard } from "./card";

/**
 * # Active Recall
 *
 * ## Business Value & Purpose
 * Converts material into a question whose answer is hidden. Retrieving an answer from
 * memory builds far more durable knowledge than re-reading it, so this transformation is
 * the difference between a card the user *has* and a card the user *knows*.
 *
 * The question wording is heuristic and deliberately labelled as such — it reads the
 * card's own text for a shape it recognises and falls back to a plain recall prompt
 * rather than inventing something the card doesn't support.
 */

/** Question shapes, in priority order: the first phrasing the text supports wins. */
const QUESTION_SHAPES: Array<{ pattern: RegExp; phrase: (subject: string) => string }> = [
  {
    pattern: /because|matters/i,
    phrase: (subject) => `Why does ${subject} matter?`,
  },
  {
    pattern: /break|parts|works|by/i,
    phrase: (subject) => `How does ${subject} work?`,
  },
  {
    pattern: /mistake|confuse|error/i,
    phrase: (subject) => `What’s the common mistake with ${subject}?`,
  },
];

/** Strips the "· 3" sequence suffix that chunking adds, leaving the real subject. */
function subjectOf(title: string): string {
  return title.replace(/·.*$/, "").trim();
}

/** Formulates a recall question from a card's content and title. */
export function makeQuestion(body: string, title: string): string {
  const text = body.trim();
  const subject = subjectOf(title);

  const shape = QUESTION_SHAPES.find(({ pattern }) => pattern.test(text));
  return shape ? shape.phrase(subject.toLowerCase()) : `Recall: ${subject}`;
}

/**
 * Turns a content card into a question card whose answer is the original content, keeping
 * a reference back to the card it came from.
 */
export function recallCard(card: Card): Card {
  return createCard({
    workspaceId: card.workspaceId,
    type: "question",
    title: makeQuestion(card.body, card.title),
    body: "", // A question hides its detail; the body would give the answer away.
    answer: card.body,
    sourceRef: card.id,
    cite: card.cite,
  });
}
