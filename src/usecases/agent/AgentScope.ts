import { Card } from "../../entities/card";
import { AgentScopeKind, DEFAULT_SCOPE_BUDGET, ScopeBudget } from "../../entities/agentScope";

/**
 * # Agent Scope
 *
 * ## Business Value & Purpose
 * `AgentScopeKind`/`ScopeBudget` (see `entities/agentScope.ts`) are the closed vocabulary;
 * {@link resolveScopedContext} is the single, deterministic, pure function that turns a
 * scope + selection + workspace into the bounded card list a command will actually see —
 * so "what will the AI read?" always has one honest answer instead of ad hoc per-command
 * context assembly.
 */
export type { AgentScopeKind, ScopeBudget };
export { DEFAULT_SCOPE_BUDGET };

export interface ScopedContext {
  /** The bounded, ordered (selection first) list of cards that will actually be sent. */
  cards: Card[];
  /** True when the budget cut candidates that would otherwise have been included. */
  truncated: boolean;
  /** How many candidate cards were in consideration before the card-count budget was applied. */
  totalConsideredCount: number;
  /** Total title+body characters across the returned cards. */
  totalCharacters: number;
}

export interface ResolveScopeInput {
  scope: AgentScopeKind;
  allCards: Card[];
  selectedCards: Card[];
  /** The group currently being viewed (null = workspace root); used for breadcrumb + siblings. */
  parentId: string | null;
  budget?: ScopeBudget;
}

/**
 * Builds the bounded card context for a given scope. Never returns the whole workspace
 * unbounded — `workspace`/`selected-plus-web` add breadcrumb ancestors and same-group
 * siblings *in addition to* the selection, but everything still passes through the
 * max-card then max-character budget, with `truncated` reported so the UI/receipt can
 * say so honestly rather than silently dropping context.
 */
export function resolveScopedContext(input: ResolveScopeInput): ScopedContext {
  const budget = input.budget ?? DEFAULT_SCOPE_BUDGET;

  if (input.scope === "web") {
    return { cards: [], truncated: false, totalConsideredCount: 0, totalCharacters: 0 };
  }

  const candidates: Card[] = [];
  const seen = new Set<string>();
  const push = (card: Card) => {
    if (seen.has(card.id)) return;
    seen.add(card.id);
    candidates.push(card);
  };

  // 1. Selected cards first — always the highest-priority context.
  for (const card of input.selectedCards) push(card);

  if (input.scope === "workspace" || input.scope === "selected-plus-web") {
    const byId = new Map(input.allCards.map(c => [c.id, c]));

    // 2. Active parent/group breadcrumb (ancestor chain of the current group).
    let current = input.parentId ? byId.get(input.parentId) : undefined;
    while (current) {
      push(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }

    // 3. Recent siblings in the same group, most recent first.
    const siblings = input.allCards
      .filter(c => (c.parentId ?? null) === input.parentId && !seen.has(c.id))
      .sort((a, b) => b.createdAt - a.createdAt);
    for (const card of siblings) push(card);
  }

  const totalConsideredCount = candidates.length;
  const cardBounded = candidates.slice(0, budget.maxCards);
  const cardTruncated = cardBounded.length < candidates.length;

  // Character budget applied second, dropping from the tail (lowest priority) — but
  // always keep at least the first candidate so a single large card doesn't yield an
  // empty context.
  const finalCards: Card[] = [];
  let totalCharacters = 0;
  let charTruncated = false;
  for (const card of cardBounded) {
    const len = (card.title?.length ?? 0) + (card.body?.length ?? 0);
    if (finalCards.length > 0 && totalCharacters + len > budget.maxCharacters) {
      charTruncated = true;
      break;
    }
    finalCards.push(card);
    totalCharacters += len;
  }

  return {
    cards: finalCards,
    truncated: cardTruncated || charTruncated,
    totalConsideredCount,
    totalCharacters,
  };
}
