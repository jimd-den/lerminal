import { Card } from "../../entities/card";

/**
 * # Deletion Plan
 *
 * ## Business Value & Purpose
 * Works out what a "delete these" actually means before anything is removed: which cards
 * to delete, in what order, and where to leave the user standing afterwards.
 *
 * Deciding this up front — as a pure function of the card graph — is what keeps two
 * unpleasant outcomes from happening. Deleting parents before children can orphan cards
 * the user expected to keep, and deleting the group someone is currently inside leaves
 * them staring at an empty canvas with no way back. Both are easy to get wrong and, as
 * plain data, easy to test.
 */

export interface DeletionRequest {
  /** Every card in the workspace, used to walk ancestry. */
  cards: Card[];
  selectedIds: Set<string>;
  /** The group the user is currently inside, or null at the workspace root. */
  currentGroupId: string | null;
  /** True when deleting a group takes its contents with it, rather than promoting them. */
  recursiveGroups: boolean;
}

export interface DeletionPlan {
  /** The cards the user asked to delete. */
  selected: Card[];
  /** What to actually delete, deepest first. */
  toDelete: Card[];
  /** Where to stand once the deletion is done. */
  nextGroupId: string | null;
}

/** Indexes cards by id so ancestry walks don't rescan the whole workspace each step. */
function indexById(cards: Card[]): Map<string, Card> {
  return new Map(cards.map((card) => [card.id, card]));
}

/** The chain of ancestor ids above a card, nearest first. */
function ancestorIds(card: Card, byId: Map<string, Card>): string[] {
  const chain: string[] = [];
  let parentId = card.parentId;
  while (parentId) {
    chain.push(parentId);
    parentId = byId.get(parentId)?.parentId;
  }
  return chain;
}

const depthOf = (card: Card, byId: Map<string, Card>): number =>
  ancestorIds(card, byId).length;

/** True when the card is inside another card that is also being deleted. */
const hasSelectedAncestor = (
  card: Card,
  selectedIds: Set<string>,
  byId: Map<string, Card>,
): boolean => ancestorIds(card, byId).some((id) => selectedIds.has(id));

/**
 * Where to navigate after the deletion.
 *
 * The user is only moved when the group they're standing in is being removed — either
 * directly, or as part of a recursive delete of one of its ancestors. They land on that
 * group's parent, which is the nearest place that still exists.
 */
function resolveNextGroup(
  request: DeletionRequest,
  selected: Card[],
  byId: Map<string, Card>,
): string | null {
  const { currentGroupId, recursiveGroups } = request;
  if (!currentGroupId) return null;

  const currentGroup = byId.get(currentGroupId);

  // Without recursion, an ancestor's contents are promoted rather than deleted, so the
  // only deletion that can displace the user is that of the group they're standing in.
  if (!recursiveGroups) {
    return selected.some((card) => card.id === currentGroupId)
      ? (currentGroup?.parentId ?? null)
      : currentGroupId;
  }

  const chain = [currentGroupId, ...(currentGroup ? ancestorIds(currentGroup, byId) : [])];
  // The *shallowest* doomed group in the chain: everything beneath it goes with it, so
  // its parent is the nearest ancestor that will still exist.
  const doomedAncestor = selected
    .filter((card) => card.type === "group" && chain.includes(card.id))
    .sort((left, right) => depthOf(left, byId) - depthOf(right, byId))[0];

  return doomedAncestor ? (doomedAncestor.parentId ?? null) : currentGroupId;
}

/** Builds the plan for deleting the current selection. Pure: it changes nothing. */
export function planDeletion(request: DeletionRequest): DeletionPlan {
  const byId = indexById(request.cards);
  const selected = request.cards.filter((card) => request.selectedIds.has(card.id));

  // With recursive deletion, a selected card inside another selected group is already
  // covered — deleting it separately would be redundant work on a card that's gone.
  const toDelete = selected
    .filter(
      (card) =>
        !request.recursiveGroups ||
        !hasSelectedAncestor(card, request.selectedIds, byId),
    )
    // Deepest first, so a parent is never removed out from under its children.
    .sort((left, right) => depthOf(right, byId) - depthOf(left, byId));

  return {
    selected,
    toDelete,
    nextGroupId: resolveNextGroup(request, selected, byId),
  };
}
