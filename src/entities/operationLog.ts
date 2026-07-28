import { Card } from "./card";

/**
 * # Operation Record Entity (Run Receipt / Undo Log)
 *
 * ## Business Value & Purpose
 * Every pipeline/AI/web operation must be inspectable after the fact and, where safe,
 * reversible. `OperationRecord` is the persisted receipt of a single operation: what was
 * read, whether the web was used, what was created/changed/deleted, and enough of a
 * before-snapshot to undo it safely. It is deliberately a flat, bounded log — not a
 * general command-pattern undo stack — so it fits the existing repository pattern
 * (`OperationLogRepository`, see adapters) with no new storage engine.
 *
 * Undo safety rules (enforced by the interactor that consumes this record, not here):
 * - Undo create: only if none of `createdCardIds` have been edited since `completedAt`.
 * - Undo delete/ungroup: only if no card with the same id already exists again.
 * - Never partially apply — refuse and explain rather than leave a mixed state.
 */
export interface OperationRecord {
  /** Unique id for this run. */
  id: string;
  /** The pipeline/command name that was executed (e.g. "ask", "chunk | recall | space"). */
  commandName: string;
  workspaceId: string;
  /** The group the operation targeted (undefined = workspace root). */
  parentId?: string;
  /** Ids of the cards selected/piped in as input. */
  inputCardIds: string[];
  /** Ids of cards newly created by this operation. */
  createdCardIds: string[];
  /**
   * As-created snapshots of the cards in `createdCardIds`, used to detect whether the
   * user has materially edited a created card since — undo must refuse rather than
   * discard an edit the user made after the run.
   */
  createdCardSnapshots?: Card[];
  /** Full pre-operation snapshots of cards mutated in place (for undo of edits). */
  updatedCardSnapshots?: Card[];
  /** Full snapshots of cards removed by this operation (for undo of delete/ungroup). */
  deletedCardSnapshots?: Card[];
  /** Whether this operation performed a real web search. */
  webUsed: boolean;
  /** The search query used, if `webUsed`. */
  searchQuery?: string;
  /** The model identifier used, if this operation called the agent. */
  model?: string;
  /** True if any created content came from a local fallback rather than a real model call. */
  usedLocalFallback?: boolean;
  startedAt: number;
  completedAt: number;
  /** Concise human-readable summary for the run receipt UI. */
  summary: string;
}

export interface CreateOperationRecordParams {
  id?: string;
  commandName: string;
  workspaceId: string;
  parentId?: string;
  inputCardIds?: string[];
  createdCardIds?: string[];
  createdCardSnapshots?: Card[];
  updatedCardSnapshots?: Card[];
  deletedCardSnapshots?: Card[];
  webUsed?: boolean;
  searchQuery?: string;
  model?: string;
  usedLocalFallback?: boolean;
  startedAt: number;
  completedAt?: number;
  summary: string;
}

/** Factory for a valid {@link OperationRecord}. */
export function createOperationRecord(params: CreateOperationRecordParams): OperationRecord {
  return {
    id: params.id || Math.random().toString(36).substring(2, 10),
    commandName: params.commandName,
    workspaceId: params.workspaceId,
    parentId: params.parentId,
    inputCardIds: params.inputCardIds ?? [],
    createdCardIds: params.createdCardIds ?? [],
    createdCardSnapshots: params.createdCardSnapshots,
    updatedCardSnapshots: params.updatedCardSnapshots,
    deletedCardSnapshots: params.deletedCardSnapshots,
    webUsed: params.webUsed ?? false,
    searchQuery: params.searchQuery,
    model: params.model,
    usedLocalFallback: params.usedLocalFallback,
    startedAt: params.startedAt,
    completedAt: params.completedAt ?? Date.now(),
    summary: params.summary,
  };
}

/** Fields compared to decide whether a created card has been materially edited since. */
function cardContentSignature(card: Card): string {
  return JSON.stringify({
    title: card.title,
    body: card.body,
    answer: card.answer,
    fields: card.fields,
    parentId: card.parentId,
  });
}

/**
 * True when this record's created cards can still be safely undone: every created card
 * must still exist in `currentCards`, unchanged from its `createdCardSnapshots` entry.
 * Refuses (returns false) if snapshots weren't captured, a card is already gone, or a
 * card's content diverges from its as-created snapshot — undo must never discard an edit.
 */
export function canUndoCreate(record: OperationRecord, currentCards: Card[]): boolean {
  if (record.createdCardIds.length === 0) return false;
  if (!record.createdCardSnapshots || record.createdCardSnapshots.length !== record.createdCardIds.length) {
    return false;
  }
  const currentById = new Map(currentCards.map(c => [c.id, c]));
  const snapshotById = new Map(record.createdCardSnapshots.map(c => [c.id, c]));
  return record.createdCardIds.every(id => {
    const current = currentById.get(id);
    const snapshot = snapshotById.get(id);
    if (!current || !snapshot) return false;
    return cardContentSignature(current) === cardContentSignature(snapshot);
  });
}
