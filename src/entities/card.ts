import { ScheduleState } from "./schedule";

/**
 * # Card Entity Domain Model
 * 
 * ## Business Value & Purpose
 * The card is the universal unit of knowledge in Learnimal. Following the Unix philosophy,
 * all sources, notes, concepts, and questions are stored as Cards. Having a single card format
 * allows commands to be chained together flexibly (e.g., source cards pipe into chunk cards,
 * which pipe into question cards).
 * 
 * ## Card Types
 * - `source`: Original reading material (e.g., text, url).
 * - `chunk`: An atomic, single-idea card extracted from a source.
 * - `question`: An active recall question, where the answer is hidden until prompt.
 * - `note`: A user-created thought or summary card.
 */

export type CardType = "source" | "chunk" | "question" | "note";

export interface Card {
  /** Unique identifier for the card. */
  id: string;
  /** The workspace this card belongs to. */
  workspaceId: string;
  /** The specific type of the card, determining compatible pipeline actions. */
  type: CardType;
  /** The main heading or question text. */
  title: string;
  /** Detailed content, answer explanation, or source text. */
  body: string;
  /** Epoch timestamp when the card was created. */
  createdAt: number;
  /** Optional tags for filtering. */
  tags: string[];
  /** Optional reference to the original source card ID this card was derived from. */
  sourceRef?: string;
  /** Optional citation string (e.g. source url or title). */
  cite?: string;
  /** Optional spaced repetition state. Present if the card is scheduled. */
  schedule?: ScheduleState;
  /** Optional fields for recall questions. */
  answer?: string;
}

/**
 * Helper options for creating a new card.
 */
export interface CreateCardParams {
  id?: string;
  workspaceId: string;
  type: CardType;
  title: string;
  body: string;
  tags?: string[];
  sourceRef?: string;
  cite?: string;
  schedule?: ScheduleState;
  answer?: string;
  createdAt?: number;
}

/**
 * Factory function to instantiate a valid Card entity with default values if omitted.
 * 
 * @param params Construction parameters for the card.
 * @returns A fully initialized Card entity.
 */
export function createCard(params: CreateCardParams): Card {
  const logTimestamp = new Date().toISOString();
  
  // Simple unique ID generator conforming to dependency minimalism
  const generatedId = params.id || Math.random().toString(36).substring(2, 10);
  const createdTime = params.createdAt || Date.now();

  const card: Card = {
    id: generatedId,
    workspaceId: params.workspaceId,
    type: params.type,
    title: params.title,
    body: params.body,
    createdAt: createdTime,
    tags: params.tags || [],
    sourceRef: params.sourceRef,
    cite: params.cite,
    schedule: params.schedule,
    answer: params.answer,
  };

  console.log(`[${logTimestamp}] [createCard] INPUTS: params=${JSON.stringify(params)} | OUTPUT: ${JSON.stringify(card)}`);
  return card;
}
