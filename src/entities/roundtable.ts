/**
 * # Roundtable — a saved panel of voices
 *
 * ## Business Value & Purpose
 * "Ask everyone" was a single button that put a question to every persona the user had
 * ever made. That is the wrong unit: the panel you want for a thermodynamics problem is
 * not the panel you want for a chapter of prose, and a user who makes eight personas
 * loses the feature entirely because "all" becomes unusable.
 *
 * A roundtable is the missing noun — *this* set of voices, named, saved, and asked
 * together. Choosing one and asking it is a single tap, and the panel survives the
 * conversation it was built for.
 *
 * ## What it is not
 * Not a persona, and not a container for one. It holds *references* to chat profiles that
 * exist in their own right, so a voice can sit on several panels and can still be asked
 * alone. Deleting a roundtable is therefore a cheap, safe act: it removes a grouping, and
 * never the voices grouped.
 *
 * ## Members that have gone away
 * A profile referenced here can be deleted from under it. That is expected rather than
 * exceptional, so the id list is treated as a *filter over what currently exists* — see
 * {@link resolveRoundtableMembers} — and never as a promise that each id still resolves.
 */
export interface Roundtable {
  id: string;
  /** What the user called this panel, e.g. "The skeptics" or "Thesis committee". */
  name: string;
  /** The natural-language brief the panel was generated from, when it was. */
  brief?: string;
  /**
   * The chat profile ids that speak, in the order they answer. Order is content: an
   * argument reads differently when the contrarian goes last, and each voice's turn sees
   * the transcript so far.
   */
  memberIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CreateRoundtableParams {
  id?: string;
  name: string;
  brief?: string;
  memberIds: string[];
  now?: number;
}

/** The most voices one panel may hold. Past this a "conversation" is a queue of monologues. */
export const MAX_ROUNDTABLE_MEMBERS = 8;

export function createRoundtable(params: CreateRoundtableParams): Roundtable {
  const now = params.now ?? Date.now();
  return {
    id: params.id ?? `rt_${Math.random().toString(36).substring(2, 10)}`,
    name: params.name.trim() || "Roundtable",
    ...(params.brief?.trim() ? { brief: params.brief.trim() } : {}),
    // De-duplicated on the way in: a voice listed twice would answer twice in a row,
    // which reads as a bug rather than as emphasis.
    memberIds: dedupe(params.memberIds).slice(0, MAX_ROUNDTABLE_MEMBERS),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The members that still exist, in the panel's own order.
 *
 * Deleted members are dropped silently rather than surfaced as an error: the user removed
 * a voice, which is a thing they are allowed to do, and a panel of the remaining three is
 * more useful than a broken one. A roundtable whose members have all gone away resolves to
 * nothing, and callers must treat that as "nobody to ask" rather than falling back to
 * asking everyone — which would put the question to voices the user did not choose.
 */
export function resolveRoundtableMembers<T extends { id: string }>(
  roundtable: Roundtable,
  available: T[]
): T[] {
  const byId = new Map(available.map(item => [item.id, item]));
  return roundtable.memberIds
    .map(id => byId.get(id))
    .filter((item): item is T => item !== undefined);
}

function dedupe(ids: string[]): string[] {
  const seen = new Set<string>();
  return ids.filter(id => {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) return false;
    seen.add(trimmed);
    return true;
  });
}
