import { Card } from "../../entities/card";

/**
 * # Situation Report — the ship's vitals, counted not claimed
 *
 * ## Business Value & Purpose
 * The strip across the top of the bridge is the one thing on the display that is true
 * before any model runs, before any key is set, and before the device has a network. It is
 * plain counting over the cards already in memory: how much material there is, how much of
 * it is unresolved, how much is due.
 *
 * That matters for more than robustness. A display whose every reading depends on a model
 * call is a display that is blank exactly when the user most needs orientation — on first
 * open, offline, or with a 2B model that just returned nothing usable. These numbers are
 * always there, so the instrument panel is never dark.
 *
 * ## The discipline
 * Nothing here reads the network, calls a model, or infers. Every field is a count or a
 * ratio of counts, and every phrase this file produces describes *the cards*, never
 * something the app did. If a number cannot be computed it is zero, and zero is shown as
 * zero — the panel never hides a reading to look healthier.
 *
 * Pure: no I/O, no React, no clock of its own (`now` is passed in).
 */

export interface SituationReport {
  /** Every card in the workspace, groups included. */
  total: number;
  /** Question cards with no answer written. */
  openQuestions: number;
  /** Source cards holding a link whose text nobody has pulled in. */
  unextractedSources: number;
  /** Non-group cards sitting at the workspace root with no group of their own. */
  ungrouped: number;
  /** Cards enrolled in review whose `dueAt` has passed. */
  due: number;
  /** Cards enrolled in review at all. */
  scheduled: number;
  /**
   * How settled the workspace is, 0..1 — the share of material that is neither an open
   * question, an unextracted source, nor loose at the root.
   *
   * Deliberately called *settled* rather than "progress" or "mastery". It measures
   * housekeeping, which is all counting can honestly measure; nothing here knows whether
   * the captain understands any of it.
   */
  settled: number;
  /** One plain sentence naming the most notable reading, or the calm case. */
  headline: string;
}

/** The reading for an empty or missing workspace — all zeroes, honestly stated. */
export const EMPTY_SITUATION: SituationReport = {
  total: 0,
  openQuestions: 0,
  unextractedSources: 0,
  ungrouped: 0,
  due: 0,
  scheduled: 0,
  settled: 0,
  headline: "Nothing aboard yet. Capture something, or give a station a subject.",
};

/**
 * Counts the workspace. `now` is passed rather than read so the same cards always produce
 * the same report in a test.
 */
export function readSituation(
  cards: Card[],
  workspaceId: string,
  now: number
): SituationReport {
  const inWorkspace = cards.filter(card => card.workspaceId === workspaceId);
  if (inWorkspace.length === 0) return EMPTY_SITUATION;

  const openQuestions = inWorkspace.filter(
    card => card.type === "question" && !card.answer?.trim()
  ).length;

  const unextractedSources = inWorkspace.filter(
    card => card.type === "source" && isUrl(card.cite) && !card.body?.trim()
  ).length;

  // Groups are excluded: a group at the root is the structure, not something missing it.
  const ungrouped = inWorkspace.filter(
    card => card.type !== "group" && !card.parentId
  ).length;

  const scheduled = inWorkspace.filter(card => card.schedule !== undefined).length;
  const due = inWorkspace.filter(
    card => card.schedule !== undefined && card.schedule.dueAt <= now
  ).length;

  const unsettled = openQuestions + unextractedSources + ungrouped;
  // Clamped because the three counts overlap — an ungrouped open question is both — and a
  // ratio below zero would be an artefact of double counting rather than a reading.
  const settled = clamp01(1 - unsettled / inWorkspace.length);

  return {
    total: inWorkspace.length,
    openQuestions,
    unextractedSources,
    ungrouped,
    due,
    scheduled,
    settled,
    headline: headlineFor({ openQuestions, unextractedSources, ungrouped, due }),
  };
}

/**
 * The single most notable reading, in priority order: what is due beats what is missing,
 * because material going cold is time-sensitive and structure is not.
 *
 * One sentence, never a list. A headline that reports everything reports nothing.
 */
function headlineFor(counts: {
  openQuestions: number;
  unextractedSources: number;
  ungrouped: number;
  due: number;
}): string {
  if (counts.due > 0) {
    return `${counts.due} ${plural(counts.due, "card is", "cards are")} due for review.`;
  }
  if (counts.openQuestions > 0) {
    return `${counts.openQuestions} ${plural(counts.openQuestions, "question", "questions")} still ${plural(counts.openQuestions, "has", "have")} no answer.`;
  }
  if (counts.unextractedSources > 0) {
    return `${counts.unextractedSources} ${plural(counts.unextractedSources, "source", "sources")} ${plural(counts.unextractedSources, "has", "have")} a link but no text.`;
  }
  if (counts.ungrouped > 0) {
    return `${counts.ungrouped} ${plural(counts.ungrouped, "card is", "cards are")} loose at the top level.`;
  }
  return "All quiet. Nothing outstanding in this workspace.";
}

/**
 * Cards that are due, oldest first — what the tactical watch actually pushes.
 *
 * Ordered by how long they have been overdue rather than by when they were made, because
 * the card that has been waiting longest is the one closest to being genuinely forgotten.
 */
export function dueCards(cards: Card[], workspaceId: string, now: number): Card[] {
  return cards
    .filter(
      card =>
        card.workspaceId === workspaceId &&
        card.schedule !== undefined &&
        card.schedule.dueAt <= now
    )
    .sort((a, b) => (a.schedule?.dueAt ?? 0) - (b.schedule?.dueAt ?? 0));
}

/**
 * How overdue the oldest due card is, phrased for a display: "3 days", "6 hours", "just
 * now". Returns null when nothing is due, so the caller renders no label rather than a
 * zero.
 */
export function overdueLabel(cards: Card[], now: number): string | null {
  const oldest = cards.reduce<number | null>((worst, card) => {
    const dueAt = card.schedule?.dueAt;
    if (dueAt === undefined || dueAt > now) return worst;
    return worst === null ? dueAt : Math.min(worst, dueAt);
  }, null);
  if (oldest === null) return null;

  const ms = now - oldest;
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days} ${plural(days, "day", "days")} overdue`;
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `${hours} ${plural(hours, "hour", "hours")} overdue`;
  return "due now";
}

function isUrl(value: string | undefined): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
