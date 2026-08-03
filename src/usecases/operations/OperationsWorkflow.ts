import { Card } from "../../entities/card";
import { createOperationRecord } from "../../entities/operationLog";
import { UseCaseError } from "../errors";
import { OperationLogRepository } from "../ports/repositories/OperationLogRepository";
import { NotificationGateway } from "../ports/gateways/NotificationGateway";
import {
  UndoOperationInteractor,
  UndoUnavailableError,
} from "../undo/UndoOperationInteractor";

/**
 * # Operations Workflow
 *
 * ## Business Value & Purpose
 * Everything that happens *around* a run rather than inside it: what the activity banner
 * is showing, the receipt afterwards, and whether the last run can still be taken back.
 *
 * These three were separate concerns scattered through the controller, but they are one
 * lifecycle — a run starts (pending), finishes (receipt + undo record), and is either
 * accepted or reversed. Holding them together is what makes the guarantee legible: a run
 * is only ever undoable because a record was written for it here, and a refused undo
 * leaves the workspace exactly as it was.
 */

/** A unit of work currently in flight, or one that failed and can be retried. */
export interface PendingOperation {
  id: string;
  commandName: string;
  status: "loading" | "error";
  /**
   * What to say if this finishes while the user is away. Absent means "never interrupt
   * them for this one" — most operations are fast enough that a notification would be
   * noise, so it is opt-in per job rather than a blanket policy.
   */
  notifyOnComplete?: string;
  errorMessage?: string;
  pipelineText?: string;
  inputCardIds?: string[];
  parentId?: string | null;
  workspaceId?: string;
}

/** The receipt shown after a run: what was made, and where it went. */
export interface OperationResult {
  summary: string;
  createdCardIds: string[];
  destination: { spaceId: string; groupId?: string; cardId?: string };
  primaryActionLabel: string;
}

/** What is needed to write an undoable record for a completed run. */
export interface CompletedRun {
  commandName: string;
  workspaceId: string;
  /** The group the run wrote into, if any — matches `OperationRecord.parentId`. */
  parentId?: string;
  inputCardIds: string[];
  /** The created cards *as they finally landed*, after any auto-grouping. */
  createdCards: Card[];
  startedAt: number;
  summary: string;
}

export interface OperationsHost {
  /** The cards currently loaded, used to verify an undo before applying it. */
  cards(): Card[];
  activeWorkspaceId(): string | null;
  onChange(): void;
  notify(message: string): void;
  /** Cards no longer exist: drop them from selection, open card, and current group. */
  forgetCards(removedCardIds: string[]): void;
  /** Reload the active workspace's cards after a change on disk. */
  refreshCards(): Promise<void>;
  /** Move the user to a receipt's destination and select what it created. */
  navigateToResult(result: OperationResult): Promise<void>;
  /**
   * Whether the user is actually looking at the app right now.
   *
   * The whole policy rests on this: a job that lands while they are watching already told
   * them through the activity banner, and a notification on top of that is noise. The
   * notification exists for the case where they walked away. Optional — a host that cannot
   * tell is treated as foreground, which errs toward not interrupting.
   */
  isForeground?(): boolean;
}

export interface OperationsWorkflowDeps {
  operationLog: OperationLogRepository;
  undoOperation: UndoOperationInteractor;
  host: OperationsHost;
  /** Injectable for tests; defaults to a short random id. */
  generateId?: () => string;
  /**
   * Where "your generation is done" goes. Optional: without one, long jobs simply finish
   * quietly, exactly as they did before notifications existed.
   */
  notifications?: NotificationGateway;
}

export interface OperationsState {
  pending: PendingOperation[];
  result: OperationResult | null;
  /** The most recent undoable operation, or null when there's nothing to take back. */
  undoableOperationId: string | null;
}

const defaultId = () => Math.random().toString(36).substring(2, 9);

const messageFor = (error: unknown, fallback: string): string =>
  error instanceof UseCaseError ? error.userMessage : fallback;

export class OperationsWorkflow {
  private current: OperationsState = {
    pending: [],
    result: null,
    undoableOperationId: null,
  };

  private readonly generateId: () => string;

  constructor(private readonly deps: OperationsWorkflowDeps) {
    this.generateId = deps.generateId ?? defaultId;
  }

  get state(): OperationsState {
    return this.current;
  }

  private patch(changes: Partial<OperationsState>): void {
    this.current = { ...this.current, ...changes };
    this.deps.host.onChange();
  }

  private patchPending(
    id: string,
    changes: Partial<PendingOperation>,
  ): void {
    this.patch({
      pending: this.current.pending.map((op) =>
        op.id === id ? { ...op, ...changes } : op,
      ),
    });
  }

  // --- In-flight work ---

  /**
   * Registers work the activity banner should show. `retry` is what makes a failed run
   * re-runnable faithfully — the scope it originally ran against, not whatever is
   * selected by the time the user taps retry.
   */
  begin(
    commandName: string,
    retry?: { pipelineText: string; inputCardIds: string[]; parentId: string | null },
    options?: {
      /**
       * Notify the user if this finishes while they are away. Reserved for jobs slow
       * enough to walk away from — a model generation, not a local regroup.
       */
      notifyOnComplete?: string;
    },
  ): string {
    const id = this.generateId();
    this.patch({
      pending: [
        ...this.current.pending,
        {
          id,
          commandName,
          status: "loading",
          workspaceId: this.deps.host.activeWorkspaceId() ?? undefined,
          ...(options?.notifyOnComplete
            ? { notifyOnComplete: options.notifyOnComplete }
            : {}),
          ...retry,
        },
      ],
    });
    return id;
  }

  end(id: string): void {
    const finished = this.find(id);
    this.patch({ pending: this.current.pending.filter((op) => op.id !== id) });
    if (finished?.notifyOnComplete) {
      this.announce("Ready", finished.notifyOnComplete);
    }
  }

  /** Leaves the operation on screen as a failure the user can retry or dismiss. */
  fail(id: string, errorMessage: string): void {
    const failing = this.find(id);
    this.patchPending(id, { status: "error", errorMessage });
    // A job worth notifying about on success is worth notifying about when it fails —
    // otherwise someone who walked away waits for something that is never coming.
    if (failing?.notifyOnComplete) {
      this.announce("Didn't finish", errorMessage);
    }
  }

  /**
   * Sends one completion notification, if there is anywhere to send it and the user is
   * actually away. Never awaited and never allowed to throw: the work already finished,
   * and its outcome must not depend on whether a notification could be delivered.
   */
  private announce(title: string, body: string): void {
    const notifications = this.deps.notifications;
    if (!notifications) return;
    // Absent host support is treated as foreground — erring toward not interrupting.
    const away = this.deps.host.isForeground ? !this.deps.host.isForeground() : false;
    if (!away) return;
    void notifications.notify({ title, body, threadId: "griot-generation" });
  }

  find(id: string): PendingOperation | undefined {
    return this.current.pending.find((op) => op.id === id);
  }

  // --- Receipts ---

  /** Publishes the receipt for a finished run. */
  present(result: OperationResult): void {
    this.patch({ result });
  }

  dismissResult(): void {
    this.patch({ result: null });
  }

  /** Takes the user to what the run produced, then clears the receipt. */
  async openResult(): Promise<void> {
    const result = this.current.result;
    if (!result) return;
    await this.deps.host.navigateToResult(result);
    this.patch({ result: null });
  }

  // --- Undo ---

  /**
   * Adopts a record some other use case already wrote as the undoable one.
   *
   * For operations that build their own receipt because they know things this workflow
   * doesn't — mission acceptance records which model and which queries were genuinely
   * used. Re-recording it here would write a second, less accurate log entry for the same
   * run, so the caller saves the record and this only marks it as the one undo targets.
   */
  markUndoable(operationId: string): void {
    this.patch({ undoableOperationId: operationId });
  }

  /**
   * Records a completed run so it can be taken back. Snapshots are the caller's
   * responsibility to capture *after* the cards have settled, so a later undo compares
   * against what the user actually saw.
   */
  async recordCompletedRun(run: CompletedRun): Promise<string> {
    const record = createOperationRecord({
      commandName: run.commandName,
      workspaceId: run.workspaceId,
      parentId: run.parentId,
      inputCardIds: run.inputCardIds,
      createdCardIds: run.createdCards.map((card) => card.id),
      createdCardSnapshots: run.createdCards.map((card) => ({ ...card })),
      startedAt: run.startedAt,
      summary: run.summary,
    });
    await this.deps.operationLog.saveRecord(record);
    this.patch({ undoableOperationId: record.id });
    return record.id;
  }

  /**
   * Reverses the most recent run, or explains why it can't.
   *
   * Refusal is a success case: the interactor checks everything before touching
   * anything, so "can't undo" means the workspace is untouched — which is the point.
   * Silently half-reversing would be far worse than declining.
   */
  async undoLast(): Promise<boolean> {
    const operationId = this.current.undoableOperationId;
    if (!operationId) return false;

    const record = await this.deps.operationLog.getRecord(operationId);
    if (!record) {
      this.patch({ undoableOperationId: null });
      return false;
    }

    try {
      const result = await this.deps.undoOperation.execute(
        record,
        this.deps.host.cards(),
      );

      this.deps.host.forgetCards(result.removedCardIds);
      this.patch({ undoableOperationId: null, result: null });
      await this.deps.host.refreshCards();
      this.deps.host.onChange();
      this.deps.host.notify(result.summary);
      return true;
    } catch (error) {
      // The reason matters more than the failure: it tells the user what to do instead.
      this.deps.host.notify(messageFor(error, "Couldn't undo that"));
      // Only an unavailable undo is permanent; a transient failure keeps the offer open.
      if (error instanceof UndoUnavailableError) {
        this.patch({ undoableOperationId: null });
      }
      return false;
    }
  }
}
