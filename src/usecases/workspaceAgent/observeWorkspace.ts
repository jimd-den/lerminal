import { Card } from "../../entities/card";

/**
 * # Workspace Pulse Observation
 *
 * ## Business Value & Purpose
 * The Workspace Agent's "pulse" is a small, honest nudge about the state of a
 * workspace — never a claim that anything was read, searched, or generated. Everything
 * here is computed from the cards already in memory with plain counting/grouping; there
 * is no model call and no network access anywhere in this file.
 *
 * Only ever one observation is returned (or none) so the pulse reads as a single,
 * calm suggestion rather than a dashboard of complaints.
 */

export type WorkspacePulseKind =
  | "notes-need-question"
  | "unextracted-source"
  | "unlinked-note-cluster";

export interface WorkspacePulseObservation {
  kind: WorkspacePulseKind;
  /** Plain-language nudge, phrased as an observation about the workspace's cards — never as something AI or the web did. */
  message: string;
  /** Card ids the observation is about, so a chip action can target them precisely. */
  cardIds: string[];
}

const MIN_NOTE_CLUSTER = 3;
const MIN_LOOSE_NOTES = 4;

/**
 * Looks at the cards belonging to `workspaceId` and returns at most one deterministic
 * observation worth surfacing, or `null` when there is nothing notable. Order of checks
 * is the priority order: an open question outnumbered by related notes is the most
 * actionable, followed by a source nobody has extracted yet, followed by a loose cluster
 * of unlinked notes.
 */
export function observeWorkspace(
  cards: Card[],
  workspaceId: string,
): WorkspacePulseObservation | null {
  const inWorkspace = cards.filter((card) => card.workspaceId === workspaceId);
  if (inWorkspace.length === 0) return null;

  const notesToQuestion = findNotesNeedingQuestion(inWorkspace);
  if (notesToQuestion) return notesToQuestion;

  const unextractedSource = findUnextractedSource(inWorkspace);
  if (unextractedSource) return unextractedSource;

  const looseCluster = findUnlinkedNoteCluster(inWorkspace);
  if (looseCluster) return looseCluster;

  return null;
}

/**
 * An open (unanswered) question card sitting alongside a small pile of note cards —
 * the shape of "you've written several notes about this but never actually resolved the
 * question." Simple heuristic: any question-type card with no answer, plus at least
 * `MIN_NOTE_CLUSTER` note-type cards sharing that question's parent group.
 */
function findNotesNeedingQuestion(cards: Card[]): WorkspacePulseObservation | null {
  const openQuestions = cards.filter(
    (card) => card.type === "question" && !card.answer?.trim(),
  );

  for (const question of openQuestions) {
    const siblingNotes = cards.filter(
      (card) => card.type === "note" && card.parentId === question.parentId,
    );
    if (siblingNotes.length >= MIN_NOTE_CLUSTER) {
      return {
        kind: "notes-need-question",
        message: `${siblingNotes.length} notes sit near an unanswered question — worth resolving it?`,
        cardIds: [question.id, ...siblingNotes.map((card) => card.id)],
      };
    }
  }

  return null;
}

/** A source card with a URL cite but no extracted body — nobody has pulled its text in yet. */
function findUnextractedSource(cards: Card[]): WorkspacePulseObservation | null {
  const unextracted = cards.find(
    (card) =>
      card.type === "source" && isUrl(card.cite) && !card.body?.trim(),
  );
  if (!unextracted) return null;

  return {
    kind: "unextracted-source",
    message: "There's a source with a link but no extracted text yet.",
    cardIds: [unextracted.id],
  };
}

/** A pile of note cards sitting at the workspace root with no group of their own. */
function findUnlinkedNoteCluster(cards: Card[]): WorkspacePulseObservation | null {
  const looseNotes = cards.filter((card) => card.type === "note" && !card.parentId);
  if (looseNotes.length < MIN_LOOSE_NOTES) return null;

  return {
    kind: "unlinked-note-cluster",
    message: `${looseNotes.length} notes are sitting ungrouped at the top level.`,
    cardIds: looseNotes.map((card) => card.id),
  };
}

function isUrl(value: string | undefined): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}
