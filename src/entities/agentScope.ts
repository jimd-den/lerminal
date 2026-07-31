/**
 * # Agent Scope — the closed set of "what will it read"
 *
 * ## Business Value & Purpose
 * Every AI operation must state, before it runs, exactly what it will read.
 * `AgentScopeKind` is the closed set of legal answers, and `ScopeBudget` is the pair of
 * hard caps that keeps any scope from silently becoming "the whole workspace". Both are
 * pure domain vocabulary — no I/O, no framework — so they live in entities and can be
 * referenced by anything that needs to declare or reason about scope, including
 * `AssistantProfile.contextPolicy`, without reaching into the use-case layer.
 *
 * The actual bounding logic (`resolveScopedContext`) stays in
 * `usecases/agent/AgentScope.ts`: it reads live card lists and a tree, which is
 * orchestration, not a value type.
 */
export type AgentScopeKind = "selected-only" | "workspace" | "web" | "selected-plus-web";

export interface ScopeBudget {
  /** Hard cap on the number of cards included, regardless of character budget. */
  maxCards: number;
  /** Hard cap on total title+body characters included across all cards. */
  maxCharacters: number;
}

/** Conservative defaults: enough context to be useful, small enough to stay legible in a preflight preview. */
export const DEFAULT_SCOPE_BUDGET: ScopeBudget = { maxCards: 12, maxCharacters: 6000 };
