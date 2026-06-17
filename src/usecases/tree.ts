import { Card } from "../entities/card";

/**
 * # Card Tree Helpers
 *
 * ## Business Value & Purpose
 * Cards form an arbitrarily deep tree through their `parentId` pointer, which lets
 * users organize a workspace into infinite subgroups. These pure functions answer
 * the structural questions the presenter and pipeline need — what lives directly
 * under a group, what lives anywhere beneath it, and the path back to the root —
 * without anyone re-implementing tree traversal.
 *
 * A card with no `parentId` sits at the workspace root (`parentId` is treated as
 * `null`), so cards created before grouping existed are root cards automatically.
 */

/** Normalizes a possibly-undefined parent pointer to the root sentinel `null`. */
function parentKey(card: Card): string | null {
  return card.parentId ?? null;
}

/**
 * Returns the cards whose immediate parent is `parentId` (use `null` for the
 * workspace root), preserving the input order.
 */
export function directChildren(cards: Card[], parentId: string | null): Card[] {
  return cards.filter(c => parentKey(c) === parentId);
}

/**
 * Returns every card nested anywhere beneath `groupId` (children, grandchildren,
 * …), excluding the group node itself. Cycles are guarded against.
 */
export function collectDescendants(cards: Card[], groupId: string): Card[] {
  const childrenByParent = new Map<string, Card[]>();
  for (const card of cards) {
    const key = parentKey(card);
    if (key === null) continue;
    const bucket = childrenByParent.get(key);
    if (bucket) bucket.push(card);
    else childrenByParent.set(key, [card]);
  }

  const result: Card[] = [];
  const seen = new Set<string>([groupId]);
  const stack = [groupId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const child of childrenByParent.get(current) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      result.push(child);
      stack.push(child.id);
    }
  }
  return result;
}

/**
 * Expands a selection into the cards that should flow into a pipeline: each
 * selected card plus, for any selected group, all of its descendants. Order is
 * stable and duplicates are removed.
 */
export function expandForPipe(cards: Card[], selectedIds: Iterable<string>): Card[] {
  const byId = new Map(cards.map(c => [c.id, c]));
  const out: Card[] = [];
  const seen = new Set<string>();

  const push = (card: Card) => {
    if (seen.has(card.id)) return;
    seen.add(card.id);
    out.push(card);
  };

  for (const id of selectedIds) {
    const card = byId.get(id);
    if (!card) continue;
    push(card);
    if (card.type === "group") {
      for (const descendant of collectDescendants(cards, card.id)) {
        push(descendant);
      }
    }
  }
  return out;
}

/**
 * From a set of cards, returns those whose parent is NOT also in the set — the
 * "roots" of the selection. Used when grouping so existing substructure rides
 * along with its top node instead of being flattened.
 */
export function selectionRoots(cards: Card[]): Card[] {
  const ids = new Set(cards.map(c => c.id));
  return cards.filter(c => {
    const key = parentKey(c);
    return key === null || !ids.has(key);
  });
}

/**
 * Returns the chain of group cards from the workspace root down to `groupId`
 * (inclusive), e.g. for breadcrumbs. Returns an empty array for the root
 * (`null`) or an unknown id. Cycles are guarded against.
 */
export function breadcrumbPath(cards: Card[], groupId: string | null): Card[] {
  if (groupId === null) return [];
  const byId = new Map(cards.map(c => [c.id, c]));
  const path: Card[] = [];
  const seen = new Set<string>();
  let current: string | null = groupId;
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    const card = byId.get(current);
    if (!card) break;
    path.unshift(card);
    current = card.parentId ?? null;
  }
  return path;
}
