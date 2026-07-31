import { ScheduleState } from "./schedule";
import { Provenance } from "./provenance";

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
 * - `group`: A container that nests other cards (and groups) beneath it. Groups
 *   form an arbitrarily deep tree via the `parentId` pointer, letting the user
 *   organize cards into infinite subgroups.
 */

export type CardType =
  | "source"
  | "chunk"
  | "question"
  | "note"
  | "group"
  | "search"
  | "chat"
  | "cloze"
  | "elaboration"
  | "interactive"
  /** A run that failed, kept as a durable, re-runnable record. See `failedRun.ts`. */
  | "failure";

/**
 * Optional user-facing semantic role describing a card's place in the learner's goal,
 * independent of `CardType`/`typeId` (which govern rendering and study mechanics). A
 * `question`-type card can be a `concept` in one workspace and a `task` in another;
 * setting a role never changes whether a card is reviewable — see `isSchedulable` in
 * `cardTypeDefinition.ts`, which is driven solely by the type registry's `learning` field.
 */
export type SemanticRole =
  | "goal"
  | "question"
  | "concept"
  | "source"
  | "experiment"
  | "claim"
  | "task"
  | "deliverable";

export const SEMANTIC_ROLES: SemanticRole[] = [
  "goal",
  "question",
  "concept",
  "source",
  "experiment",
  "claim",
  "task",
  "deliverable",
];

export interface Card {
  /** Unique identifier for the card. */
  id: string;
  /** The workspace this card belongs to. */
  workspaceId: string;
  /** The specific type of the card, determining compatible pipeline actions. */
  type: CardType;
  /**
   * Optional reference to a {@link CardTypeDefinition} id, enabling user-defined
   * card types. When omitted, the legacy `type` string is the effective type id, so
   * existing cards resolve to the seeded built-in definitions without migration.
   */
  typeId?: string;
  /**
   * Optional bag of structured values for the type's custom `fields` (keyed by
   * `FieldSpec.key`). Undefined for cards whose type declares no extra fields.
   */
  fields?: Record<string, string>;
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
  /**
   * Optional id of the `group` card that contains this card. Undefined means the
   * card sits at the workspace root. Forms the grouping tree.
   */
  parentId?: string;
  /** Optional citation string (e.g. source url or title). */
  cite?: string;
  /** Optional spaced repetition state. Present if the card is scheduled. */
  schedule?: ScheduleState;
  /** Optional fields for recall questions. */
  answer?: string;
  /**
   * Optional source card id that this group card serves as a document container for.
   * Enables reusing document container groups upon re-chunking.
   */
  documentGroupFor?: string;
  /**
   * Optional semantic role in the learner's goal (see {@link SemanticRole}). Purely
   * descriptive — never affects rendering, `CardType`, or study/FSRS eligibility.
   */
  role?: SemanticRole;
  /**
   * Optional record of how this card was created (manual/agent/search/extraction/command),
   * what it read, and whether it used the web. Absent on cards created before this
   * feature existed or when creation didn't warrant one — never fabricate a value.
   */
  provenance?: Provenance;
}

/**
 * Helper options for creating a new card.
 */
export interface CreateCardParams {
  id?: string;
  workspaceId: string;
  type: CardType;
  typeId?: string;
  fields?: Record<string, string>;
  title: string;
  body: string;
  tags?: string[];
  sourceRef?: string;
  parentId?: string;
  cite?: string;
  schedule?: ScheduleState;
  answer?: string;
  documentGroupFor?: string;
  createdAt?: number;
  role?: SemanticRole;
  provenance?: Provenance;
}

/**
 * Factory function to instantiate a valid Card entity with default values if omitted.
 * 
 * @param params Construction parameters for the card.
 * @returns A fully initialized Card entity.
 */
export function createCard(params: CreateCardParams): Card {
  
  // Simple unique ID generator conforming to dependency minimalism
  const generatedId = params.id || Math.random().toString(36).substring(2, 10);
  const createdTime = params.createdAt || Date.now();

  const card: Card = {
    id: generatedId,
    workspaceId: params.workspaceId,
    type: params.type,
    typeId: params.typeId,
    fields: params.fields,
    title: params.title,
    body: params.body,
    createdAt: createdTime,
    tags: params.tags || [],
    sourceRef: params.sourceRef,
    parentId: params.parentId,
    cite: params.cite,
    schedule: params.schedule,
    answer: params.answer,
    documentGroupFor: params.documentGroupFor,
    role: params.role,
    provenance: params.provenance,
  };

  return card;
}
