import { CardType, SemanticRole } from "./card";

/**
 * # Workspace Agent — the closed vocabulary of things that can happen
 *
 * ## Business Value & Purpose
 * The Workspace Agent's trust model rests on one rule: the model may *suggest* an action,
 * but only a closed, validated shape ever reaches the dispatcher, and nothing here executes
 * anything. This module defines that vocabulary — {@link AgentToolIntent} — and the pure
 * helpers for pruning a multi-item intent down to what the user actually wants.
 *
 * ## Where an intent now comes from
 * It used to come from a JSON envelope the model was asked to produce. It doesn't any
 * more: the model writes prose with inline tags, and `entities/agentTags` parses those
 * into exactly these intents. The vocabulary, the dispatcher and every interactor behind
 * it are unchanged — only the way an intent is *written down* changed, because a small
 * model can write a marker and cannot write a schema.
 *
 * ## Why this is pure
 * No I/O, no React, no network. Card ids are resolved and validated before an intent is
 * built (see `agentTags`), so a hallucinated reference can never reach a chip claiming to
 * act on a real card.
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
  /**
   * Plan a goal as a mission: the capability the retired Goal Architect sheet used to
   * own, now something the one agent can propose mid-conversation. Every step becomes a
   * card under a mission group, and — like every other intent here — nothing is created
   * until the user confirms.
   */
  | {
      type: "create_mission";
      title: string;
      goalStatement: string;
      targetDeliverable?: string;
      successCriteria?: string[];
      steps: Array<{ title: string; detail?: string; role?: SemanticRole }>;
      /** Existing cards the plan was drawn from. Validated against the real workspace. */
      cardIds?: string[];
    }
  | { type: "ask_clarifying_question"; question: string; rationale?: string }
  /**
   * Turn a casually-stated mastery goal straight into a phased syllabus — the one intent
   * reachable via a chat tag (see `entities/agentTags`) rather than only a dedicated UI
   * flow, because a capable model can be trusted to notice "I want to really understand
   * X" without the user having to open Mission Control first. Dispatch still runs the same
   * one explicit model call `GenerateSyllabusInteractor` always ran; nothing here invents
   * a source or a fact, only the goal text itself.
   */
  | { type: "generate_syllabus"; goalTitle: string };


/**
 * Every discriminator in {@link AgentToolIntent}, as data.
 *
 * The `Record<AgentToolIntent["type"], true>` annotation is the point: adding a variant to
 * the union without listing it here is a *compile* error, so the dispatcher's exhaustive
 * switch and this list can never drift apart. Order is the union's own, for readable diffs.
 */
const AGENT_TOOL_INTENT_TYPE_MAP: Record<AgentToolIntent["type"], true> = {
  suggest_next_actions: true,
  create_cards: true,
  create_group: true,
  link_cards: true,
  chunk_cards: true,
  extract_url: true,
  search_web: true,
  make_study_candidates: true,
  draft_experiment: true,
  create_mission: true,
  ask_clarifying_question: true,
  generate_syllabus: true,
};

export const AGENT_TOOL_INTENT_TYPES = Object.keys(
  AGENT_TOOL_INTENT_TYPE_MAP
) as AgentToolIntent["type"][];

/**
 * ## Per-item selection
 *
 * Some proposals are inherently a *list* of things: eight cards to create, six notes to
 * group, three queries to run. All-or-nothing confirmation forces the user to accept a bad
 * suggestion along with the good ones, so those intents expose their members as
 * individually selectable items, and confirmation dispatches an intent narrowed to exactly
 * what survived the user's pruning.
 *
 * Both functions below are pure and total: no lookups, no I/O, no knowledge of the
 * workspace. Titles for card-id-based items are the raw ids — the presenter resolves them
 * against real cards, since only it knows what a card is called.
 */
export interface ToolIntentItem {
  /** Stable within one proposal; the key the UI toggles. */
  key: string;
  /** Best label the entity layer can produce alone. */
  title: string;
  /** Optional secondary line (e.g. enough of a card body to judge it). */
  detail?: string;
  /** Set when the item *is* an existing card, so titles can be resolved upstream. */
  cardId?: string;
}

/**
 * The individually selectable members of a tool intent, or `null` for intents where a
 * per-item choice is meaningless (single-target or purely informational ones) — those
 * confirm as a whole, exactly as before.
 */
export function toolIntentItems(tool: AgentToolIntent): ToolIntentItem[] | null {
  switch (tool.type) {
    case "create_cards":
      return tool.cards.map((card, index) => ({
        key: `card-${index}`,
        title: card.title,
        detail: card.body,
      }));

    case "create_group":
    case "chunk_cards":
    case "make_study_candidates":
      return tool.cardIds.map(cardId => ({ key: cardId, title: cardId, cardId }));

    case "search_web":
      return tool.queries.map((query, index) => ({ key: `query-${index}`, title: query }));

    case "create_mission":
      // Both the plan's steps and the cards it claims to be drawn from are prunable: a
      // step the user doesn't want is never created, and a card they didn't actually
      // work from is never recorded as this mission's input.
      return [
        ...tool.steps.map((step, index) => ({
          key: `step-${index}`,
          title: step.title,
          ...(step.detail ? { detail: step.detail } : {}),
        })),
        ...(tool.cardIds ?? []).map(cardId => ({ key: cardId, title: cardId, cardId })),
      ];

    default:
      return null;
  }
}

/**
 * Narrows a tool intent to only the selected items.
 *
 * - Intents with no selectable items pass through unchanged.
 * - Returns `null` when every item was deselected: an empty create/group/search would
 *   create an empty group or run zero queries, so it must never be dispatched at all.
 *
 * The narrowed intent is what reaches the dispatcher and the real interactors, which is
 * also what makes the completion message truthful — "Created 5 cards." is derived from the
 * five that were actually dispatched, not the eight that were proposed.
 */
export function narrowToolIntent(
  tool: AgentToolIntent,
  selectedKeys: Iterable<string>
): AgentToolIntent | null {
  const selected = new Set(selectedKeys);

  switch (tool.type) {
    case "create_cards": {
      const cards = tool.cards.filter((_, index) => selected.has(`card-${index}`));
      if (cards.length === 0) return null;
      return { type: "create_cards", cards };
    }

    case "create_group": {
      const cardIds = tool.cardIds.filter(id => selected.has(id));
      if (cardIds.length === 0) return null;
      return { ...tool, cardIds };
    }

    case "chunk_cards":
    case "make_study_candidates": {
      const cardIds = tool.cardIds.filter(id => selected.has(id));
      if (cardIds.length === 0) return null;
      return { ...tool, cardIds };
    }

    case "search_web": {
      const queries = tool.queries.filter((_, index) => selected.has(`query-${index}`));
      if (queries.length === 0) return null;
      return { ...tool, queries };
    }

    case "create_mission": {
      const steps = tool.steps.filter((_, index) => selected.has(`step-${index}`));
      // A mission with every step unchecked is a group with a name and nothing in it —
      // never dispatched at all.
      if (steps.length === 0) return null;
      const cardIds = (tool.cardIds ?? []).filter(id => selected.has(id));
      const narrowed: AgentToolIntent = { ...tool, steps };
      if (tool.cardIds) {
        if (cardIds.length > 0) (narrowed as { cardIds?: string[] }).cardIds = cardIds;
        else delete (narrowed as { cardIds?: string[] }).cardIds;
      }
      return narrowed;
    }

    default:
      // Single-target or informational — nothing to narrow.
      return tool;
  }
}
