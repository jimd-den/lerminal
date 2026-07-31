/**
 * # Card Link Entity
 *
 * ## Business Value & Purpose
 * A `CardLink` is a lightweight, directed association between two cards in the same
 * workspace — "this note relates to that one" — without any of the structural weight of
 * grouping (`parentId`) or provenance (`sourceCardIds`). It exists so the Workspace
 * Agent's `link_cards` tool (see `entities/workspaceAgent.ts`) has something real to
 * create: a card-link entity, not a fabricated relationship.
 *
 * ## Scope
 * Deliberately minimal: no graph traversal, no cascading deletes, no cycle detection.
 * `relation` is a free-form label (the agent tends to use a small vocabulary — "Link to
 * note", "Related to", "Supports", "Questions", "Prerequisite for", "Source for" — but
 * nothing here enforces that set). Pure types and small pure helpers only; all I/O lives
 * behind `CardLinkRepository`.
 */
export interface CardLink {
  id: string;
  workspaceId: string;
  fromCardId: string;
  toCardId: string;
  relation?: string;
  createdAt: string;
}

export interface CreateCardLinkParams {
  id?: string;
  workspaceId: string;
  fromCardId: string;
  toCardId: string;
  relation?: string;
  createdAt?: string;
}

/** Factory for a new `CardLink`, defaulting `id`/`createdAt` when omitted. */
export function createCardLink(params: CreateCardLinkParams): CardLink {
  return {
    id: params.id || Math.random().toString(36).substring(2, 10),
    workspaceId: params.workspaceId,
    fromCardId: params.fromCardId,
    toCardId: params.toCardId,
    relation: params.relation,
    createdAt: params.createdAt || new Date().toISOString(),
  };
}

/** Returns every link touching `cardId` on either end (from or to). */
export function linksForCard(links: CardLink[], cardId: string): CardLink[] {
  return links.filter((link) => link.fromCardId === cardId || link.toCardId === cardId);
}

/** True when `a` and `b` describe the exact same association (same endpoints, same relation). */
export function isDuplicateCardLink(a: CardLink, b: CardLink): boolean {
  return (
    a.workspaceId === b.workspaceId &&
    a.fromCardId === b.fromCardId &&
    a.toCardId === b.toCardId &&
    (a.relation ?? "") === (b.relation ?? "")
  );
}

/** Removes exact-duplicate links (same workspace/from/to/relation), keeping the first. */
export function dedupeCardLinks(links: CardLink[]): CardLink[] {
  const kept: CardLink[] = [];
  for (const link of links) {
    if (!kept.some((existing) => isDuplicateCardLink(existing, link))) kept.push(link);
  }
  return kept;
}
