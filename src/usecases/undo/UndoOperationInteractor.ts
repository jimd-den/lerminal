import { Card } from "../../entities/card";
import { OperationRecord, canUndoCreate } from "../../entities/operationLog";
import { CardRepository } from "../../adapters/repositories/CardRepository";
import { OperationLogRepository } from "../../adapters/repositories/OperationLogRepository";
import { UseCaseError } from "../errors";

/** Raised when an undo cannot be applied safely, always carrying the reason. */
export class UndoUnavailableError extends UseCaseError {
  constructor(userMessage: string) {
    super(userMessage);
  }
}

export interface UndoResult {
  /** Cards removed by the undo. */
  removedCardIds: string[];
  /** Plain-language description of what was undone. */
  summary: string;
}

/**
 * # Undo Operation Interactor
 *
 * ## Business Value & Purpose
 * Makes the last run reversible, which is what lets a user try an AI action without
 * committing to living with the result. Without it, "Explain these six notes" is a
 * decision; with it, it's an experiment.
 *
 * ## The rule it will not break
 * **Never claim success for a partial undo.** Every check happens before anything is
 * touched, and if any of them fails the operation is refused *with the reason* rather
 * than half-applied. A user who is told "undone" and later finds three orphaned cards
 * has lost more trust than one who was told "can't undo this — you've edited two of
 * these cards since".
 *
 * That's also why editing a created card disqualifies the undo (see `canUndoCreate`):
 * deleting a card the user has since put work into would be destroying their writing to
 * reverse ours.
 */
export class UndoOperationInteractor {
  constructor(
    private readonly cardRepo: CardRepository,
    private readonly operationLog: OperationLogRepository
  ) {}

  /**
   * Reverses `record`, or throws {@link UndoUnavailableError} explaining why it can't.
   *
   * @param currentCards The workspace as it stands now — used to detect edits and
   *   deletions that happened after the run.
   */
  async execute(record: OperationRecord, currentCards: Card[]): Promise<UndoResult> {
    const createdCount = record.createdCardIds.length;
    if (createdCount === 0) {
      throw new UndoUnavailableError("This operation didn't create anything to undo");
    }

    const byId = new Map(currentCards.map(card => [card.id, card]));
    const missing = record.createdCardIds.filter(id => !byId.has(id));
    if (missing.length === createdCount) {
      // Everything is already gone — nothing to do, and saying "undone" would imply we did it.
      await this.operationLog.deleteRecord(record.id);
      throw new UndoUnavailableError("These cards are already gone");
    }
    if (missing.length > 0) {
      throw new UndoUnavailableError(
        "Some of these cards were already deleted, so undoing the rest would leave this half-reversed"
      );
    }

    if (!canUndoCreate(record, currentCards)) {
      throw new UndoUnavailableError(
        "You've edited some of these cards since — undoing would discard that work"
      );
    }

    // Only now, with every check passed, do we start changing anything.
    for (const id of record.createdCardIds) {
      await this.cardRepo.deleteCard(id);
    }

    // Restore anything the run had moved into the group it created, so undo returns the
    // workspace to its shape rather than just deleting the new parts.
    for (const snapshot of record.updatedCardSnapshots ?? []) {
      await this.cardRepo.saveCard(snapshot);
    }

    await this.operationLog.deleteRecord(record.id);

    return {
      removedCardIds: [...record.createdCardIds],
      summary: `Undid ${record.commandName} — removed ${createdCount} card${createdCount === 1 ? "" : "s"}`,
    };
  }
}
