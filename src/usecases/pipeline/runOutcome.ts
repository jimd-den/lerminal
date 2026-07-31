import { Card } from "../../entities/card";

/**
 * # Run Outcome Rules
 *
 * ## Business Value & Purpose
 * The small decisions made about a pipeline run's output *after* the commands finish:
 * whether the result deserves its own group, what to call it, and how to describe it back
 * to the user. Each one is a pure function of the cards produced, so the answers can be
 * checked directly instead of being inferred from a two-hundred-line orchestration method.
 *
 * These rules exist because "where did my result go?" is the failure this app most needs
 * to avoid, and the answers to that question are decided here.
 */

/** The parent every card shares, or `undefined` when they landed in different places. */
export function commonParentId(cards: Card[]): string | undefined {
  if (cards.length === 0) return undefined;
  const parentId = cards[0].parentId;
  return parentId && cards.every((card) => card.parentId === parentId)
    ? parentId
    : undefined;
}

/**
 * Whether these cards were *made* by this run rather than merely passed through it.
 * Commands like `space` return the cards they were given; wrapping those in a new group
 * would move the user's existing work behind a folder they didn't ask for.
 */
export function wasGeneratedTogether(cards: Card[], startedAt: number): boolean {
  return cards.every((card) => card.createdAt >= startedAt);
}

export interface AutoGroupDecision {
  cards: Card[];
  startedAt: number;
  autoGroupEnabled: boolean;
}

/**
 * Whether a run's output should be collected into its own group.
 *
 * Every run qualifies, not only multi-card ones: a run is a unit of work, so its result
 * should be a unit on the canvas. A single card dropped loose among fifty others is
 * exactly the "where did it go?" problem grouping exists to solve.
 */
export function shouldAutoGroup({
  cards,
  startedAt,
  autoGroupEnabled,
}: AutoGroupDecision): boolean {
  if (!autoGroupEnabled || cards.length === 0) return false;
  if (!wasGeneratedTogether(cards, startedAt)) return false;
  // Cards scattered across different parents aren't one result to collect.
  return new Set(cards.map((card) => card.parentId ?? null)).size === 1;
}

/** The leading command of a pipeline, used to name what its output group contains. */
export function commandNameOf(pipelineText: string): string {
  return pipelineText.match(/^\s*([\w-]+)/)?.[1] ?? "command";
}

/** Plain-language description of what a run produced, for the receipt. */
export function describeRunOutput(cards: Card[]): string {
  const label = cards.every((card) => card.type === "chunk") ? "study chunk" : "item";
  return `${cards.length} ${label}${cards.length === 1 ? "" : "s"} created`;
}
