import { CardType, SemanticRole } from "./card";

/**
 * # Workspace Agent — tool proposals ("Ask GRIOT")
 *
 * ## Business Value & Purpose
 * The Workspace Agent's whole trust model rests on one rule: the model may *propose* a
 * tool action, but only a validated, closed-shape proposal is ever allowed to reach the
 * UI, and nothing here executes anything. This module defines that closed vocabulary
 * (`AgentToolIntent`), the turn shape it travels in (`WorkspaceAgentResponse`), and the
 * single boundary function (`normalizeWorkspaceAgentResponse`) a raw model reply must
 * pass through before the app will treat it as real.
 *
 * ## Why this is pure
 * No I/O, no React, no network — mirrors `normalizeGoalArchitectTurn` in
 * `entities/goalArchitect.ts`. A model's JSON is either a fully-valid, closed-shape
 * response or it is rejected outright: no partial trust, no "salvage what parses."
 * Referenced card ids are checked against the caller-supplied `validCardIds` set so a
 * hallucinated id can never reach a proposal chip claiming to act on a real card.
 *
 * ## Phase C scope
 * This module only defines and validates the shape. Dispatching a confirmed proposal
 * into `GroupCardsInteractor`, `ExtractUrlInteractor`, `ChunkCommand`,
 * `RunResearchInteractor`, `CreateNote`, or study-candidate generation is Phase D's job —
 * nothing here calls any of them.
 */

/** The closed vocabulary of actions the Workspace Agent may propose. */
export type AgentToolIntent =
  | { type: "suggest_next_actions"; cardIds?: string[]; suggestions: string[] }
  | {
      type: "create_cards";
      cards: Array<{
        type: CardType;
        role?: SemanticRole;
        title: string;
        body: string;
        answer?: string;
        parentId?: string | null;
        sourceCardIds?: string[];
      }>;
    }
  | { type: "create_group"; name: string; cardIds: string[]; parentId?: string | null }
  | { type: "link_cards"; sourceCardId: string; targetCardId: string; relation?: string }
  | {
      type: "chunk_cards";
      cardIds: string[];
      mode: "deterministic" | "agent-assisted";
      destinationParentId?: string | null;
    }
  | { type: "extract_url"; cardId: string }
  | { type: "search_web"; queries: string[]; purpose: string; sourceKinds?: string[] }
  | { type: "make_study_candidates"; cardIds: string[]; mode: "recall" | "cloze" }
  | { type: "draft_experiment"; cardIds: string[] }
  | { type: "ask_clarifying_question"; question: string; rationale?: string };

/** One offered action: a proposal the user can inspect, but nothing executes it here. */
export interface WorkspaceAgentProposedAction {
  id: string;
  label: string;
  explanation: string;
  requiresConfirmation: boolean;
  tool: AgentToolIntent;
}

/** One validated conversational turn from the Workspace Agent. */
export interface WorkspaceAgentResponse {
  message: string;
  observation?: string;
  contextSummary?: string;
  proposedActions: WorkspaceAgentProposedAction[];
  question?: { prompt: string; rationale?: string };
}

const asString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const asOptionalString = (value: unknown): string | undefined => {
  const text = asString(value);
  return text.length > 0 ? text : undefined;
};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(asString).filter(text => text.length > 0) : [];

const CARD_TYPES: Set<CardType> = new Set([
  "source",
  "chunk",
  "question",
  "note",
  "group",
  "search",
  "chat",
  "cloze",
  "elaboration",
  "interactive",
  "failure",
]);

const SEMANTIC_ROLES: Set<SemanticRole> = new Set([
  "goal",
  "question",
  "concept",
  "source",
  "experiment",
  "claim",
  "task",
  "deliverable",
]);

const isCardType = (value: unknown): value is CardType =>
  typeof value === "string" && CARD_TYPES.has(value as CardType);

const isSemanticRole = (value: unknown): value is SemanticRole =>
  typeof value === "string" && SEMANTIC_ROLES.has(value as SemanticRole);

/**
 * Validates and normalizes one raw tool intent, checking any referenced card ids against
 * `validCardIds`. Returns `null` for anything malformed or referencing a card that
 * doesn't exist — never a partially-trusted result.
 */
function normalizeToolIntent(
  raw: unknown,
  validCardIds: Set<string>
): AgentToolIntent | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const type = asString(source.type);

  const cardIdsExist = (ids: string[]): boolean => ids.every(id => validCardIds.has(id));

  switch (type) {
    case "suggest_next_actions": {
      const suggestions = asStringArray(source.suggestions);
      if (suggestions.length === 0) return null;
      const cardIds = Array.isArray(source.cardIds) ? asStringArray(source.cardIds) : undefined;
      if (cardIds && !cardIdsExist(cardIds)) return null;
      return { type: "suggest_next_actions", suggestions, ...(cardIds ? { cardIds } : {}) };
    }

    case "create_cards": {
      if (!Array.isArray(source.cards) || source.cards.length === 0) return null;
      const cards: Array<{
        type: CardType;
        role?: SemanticRole;
        title: string;
        body: string;
        answer?: string;
        parentId?: string | null;
        sourceCardIds?: string[];
      }> = [];
      for (const item of source.cards as unknown[]) {
        if (!item || typeof item !== "object") return null;
        const c = item as Record<string, unknown>;
        const cardType = c.type;
        const title = asString(c.title);
        const body = asString(c.body);
        if (!isCardType(cardType) || !title || !body) return null;
        const role = c.role !== undefined ? c.role : undefined;
        if (role !== undefined && !isSemanticRole(role)) return null;
        const sourceCardIds = Array.isArray(c.sourceCardIds)
          ? asStringArray(c.sourceCardIds)
          : undefined;
        if (sourceCardIds && !cardIdsExist(sourceCardIds)) return null;
        const parentId =
          c.parentId === null ? null : c.parentId !== undefined ? asString(c.parentId) : undefined;
        if (parentId && !validCardIds.has(parentId)) return null;
        cards.push({
          type: cardType,
          title,
          body,
          ...(role !== undefined ? { role } : {}),
          ...(asOptionalString(c.answer) ? { answer: asOptionalString(c.answer) } : {}),
          ...(parentId !== undefined ? { parentId } : {}),
          ...(sourceCardIds ? { sourceCardIds } : {}),
        });
      }
      if (cards.length === 0) return null;
      return { type: "create_cards", cards };
    }

    case "create_group": {
      const name = asString(source.name);
      const cardIds = asStringArray(source.cardIds);
      if (!name || cardIds.length === 0 || !cardIdsExist(cardIds)) return null;
      const parentId =
        source.parentId === null
          ? null
          : source.parentId !== undefined
            ? asString(source.parentId)
            : undefined;
      if (parentId && !validCardIds.has(parentId)) return null;
      return { type: "create_group", name, cardIds, ...(parentId !== undefined ? { parentId } : {}) };
    }

    case "link_cards": {
      const sourceCardId = asString(source.sourceCardId);
      const targetCardId = asString(source.targetCardId);
      if (!sourceCardId || !targetCardId) return null;
      if (!validCardIds.has(sourceCardId) || !validCardIds.has(targetCardId)) return null;
      const relation = asOptionalString(source.relation);
      return { type: "link_cards", sourceCardId, targetCardId, ...(relation ? { relation } : {}) };
    }

    case "chunk_cards": {
      const cardIds = asStringArray(source.cardIds);
      const mode = asString(source.mode);
      if (cardIds.length === 0 || !cardIdsExist(cardIds)) return null;
      if (mode !== "deterministic" && mode !== "agent-assisted") return null;
      const destinationParentId =
        source.destinationParentId === null
          ? null
          : source.destinationParentId !== undefined
            ? asString(source.destinationParentId)
            : undefined;
      if (destinationParentId && !validCardIds.has(destinationParentId)) return null;
      return {
        type: "chunk_cards",
        cardIds,
        mode,
        ...(destinationParentId !== undefined ? { destinationParentId } : {}),
      };
    }

    case "extract_url": {
      const cardId = asString(source.cardId);
      if (!cardId || !validCardIds.has(cardId)) return null;
      return { type: "extract_url", cardId };
    }

    case "search_web": {
      const queries = asStringArray(source.queries);
      const purpose = asString(source.purpose);
      if (queries.length === 0 || !purpose) return null;
      const sourceKinds = Array.isArray(source.sourceKinds)
        ? asStringArray(source.sourceKinds)
        : undefined;
      return { type: "search_web", queries, purpose, ...(sourceKinds ? { sourceKinds } : {}) };
    }

    case "make_study_candidates": {
      const cardIds = asStringArray(source.cardIds);
      const mode = asString(source.mode);
      if (cardIds.length === 0 || !cardIdsExist(cardIds)) return null;
      if (mode !== "recall" && mode !== "cloze") return null;
      return { type: "make_study_candidates", cardIds, mode };
    }

    case "draft_experiment": {
      const cardIds = asStringArray(source.cardIds);
      if (cardIds.length === 0 || !cardIdsExist(cardIds)) return null;
      return { type: "draft_experiment", cardIds };
    }

    case "ask_clarifying_question": {
      const question = asString(source.question);
      if (!question) return null;
      const rationale = asOptionalString(source.rationale);
      return { type: "ask_clarifying_question", question, ...(rationale ? { rationale } : {}) };
    }

    default:
      // Unknown tool type — rejected rather than passed through in any partial form.
      return null;
  }
}

function normalizeProposedAction(
  raw: unknown,
  validCardIds: Set<string>
): WorkspaceAgentProposedAction | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;

  const label = asString(source.label);
  const explanation = asString(source.explanation);
  if (!label || !explanation) return null;

  const tool = normalizeToolIntent(source.tool, validCardIds);
  if (!tool) return null;

  return {
    id: asString(source.id) || `proposal-${Math.random().toString(36).slice(2, 9)}`,
    label,
    explanation,
    requiresConfirmation: source.requiresConfirmation !== false,
    tool,
  };
}

/**
 * Validates and normalizes a model's raw Workspace Agent turn, or returns `null` if it
 * isn't usable.
 *
 * Mirrors `normalizeGoalArchitectTurn`'s validation style exactly: reject unknown tool
 * types, malformed arguments, and any card id not present in `validCardIds` — the caller
 * never receives a partially-trusted result. A turn with no message and no proposed
 * actions and no question is not a usable turn.
 */
export function normalizeWorkspaceAgentResponse(
  raw: unknown,
  validCardIds: Set<string>
): WorkspaceAgentResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;

  const message = asString(source.message);
  const observation = asOptionalString(source.observation);
  const contextSummary = asOptionalString(source.contextSummary);

  const rawQuestion = source.question as Record<string, unknown> | undefined;
  const question =
    rawQuestion && asString(rawQuestion.prompt)
      ? {
          prompt: asString(rawQuestion.prompt),
          ...(asOptionalString(rawQuestion.rationale)
            ? { rationale: asOptionalString(rawQuestion.rationale) }
            : {}),
        }
      : undefined;

  let proposedActions: WorkspaceAgentProposedAction[] = [];
  if (source.proposedActions !== undefined) {
    if (!Array.isArray(source.proposedActions)) return null;
    for (const item of source.proposedActions) {
      const action = normalizeProposedAction(item, validCardIds);
      // Any malformed action invalidates the whole turn rather than being silently
      // dropped — a model that got one proposal wrong is not trusted to have gotten
      // the others right either.
      if (!action) return null;
      proposedActions.push(action);
    }
  }

  if (!message && !question && proposedActions.length === 0) return null;

  return {
    message,
    ...(observation ? { observation } : {}),
    ...(contextSummary ? { contextSummary } : {}),
    proposedActions,
    ...(question ? { question } : {}),
  };
}
