import { describe, expect, it, beforeEach } from "bun:test";
import {
  OperationsWorkflow,
  OperationsHost,
  OperationResult,
} from "../OperationsWorkflow";
import { UndoOperationInteractor } from "../../undo/UndoOperationInteractor";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { MemoryOperationLogRepository } from "../../../adapters/repositories/MemoryOperationLogRepository";
import { Card, createCard } from "../../../entities/card";

class RecordingHost implements OperationsHost {
  cardList: Card[] = [];
  workspaceId: string | null = "w1";
  changes = 0;
  messages: string[] = [];
  forgotten: string[][] = [];
  refreshes = 0;
  navigations: OperationResult[] = [];

  cards() {
    return this.cardList;
  }
  activeWorkspaceId() {
    return this.workspaceId;
  }
  onChange() {
    this.changes++;
  }
  notify(message: string) {
    this.messages.push(message);
  }
  forgetCards(removedCardIds: string[]) {
    this.forgotten.push(removedCardIds);
    this.cardList = this.cardList.filter((card) => !removedCardIds.includes(card.id));
  }
  async refreshCards() {
    this.refreshes++;
  }
  async navigateToResult(result: OperationResult) {
    this.navigations.push(result);
  }
}

const receipt = (): OperationResult => ({
  summary: "2 items created",
  createdCardIds: ["a", "b"],
  destination: { spaceId: "w1" },
  primaryActionLabel: "Open result",
});

describe("OperationsWorkflow", () => {
  let host: RecordingHost;
  let cardRepo: MemoryCardRepository;
  let operationLog: MemoryOperationLogRepository;
  let workflow: OperationsWorkflow;
  let nextId: number;

  beforeEach(() => {
    host = new RecordingHost();
    cardRepo = new MemoryCardRepository();
    operationLog = new MemoryOperationLogRepository();
    nextId = 0;
    workflow = new OperationsWorkflow({
      operationLog,
      undoOperation: new UndoOperationInteractor(cardRepo, operationLog),
      host,
      generateId: () => `op-${++nextId}`,
    });
  });

  /** Runs a command end to end so there is something real to undo. */
  const runAndRecord = async (): Promise<string> => {
    const created = [
      createCard({ workspaceId: "w1", type: "note", title: "One", body: "b" }),
      createCard({ workspaceId: "w1", type: "note", title: "Two", body: "b" }),
    ];
    await cardRepo.saveCards(created);
    host.cardList = [...created];
    return workflow.recordCompletedRun({
      commandName: "chunk",
      workspaceId: "w1",
      inputCardIds: [],
      createdCards: created,
      startedAt: Date.now() - 100,
      summary: "2 items created",
    });
  };

  describe("in-flight work", () => {
    it("tracks a run from start to finish", () => {
      const id = workflow.begin("chunk");
      expect(workflow.state.pending).toHaveLength(1);
      expect(workflow.state.pending[0]).toMatchObject({
        commandName: "chunk",
        status: "loading",
        workspaceId: "w1",
      });

      workflow.end(id);
      expect(workflow.state.pending).toEqual([]);
    });

    it("keeps a failed run on screen with the retry scope it originally had", () => {
      const id = workflow.begin("chunk", {
        pipelineText: "chunk",
        inputCardIds: ["c1"],
        parentId: "g1",
      });
      workflow.fail(id, "Model unavailable");

      expect(workflow.find(id)).toMatchObject({
        status: "error",
        errorMessage: "Model unavailable",
        pipelineText: "chunk",
        inputCardIds: ["c1"],
        parentId: "g1",
      });
    });

    it("tracks concurrent runs independently", () => {
      const first = workflow.begin("chunk");
      const second = workflow.begin("ask");
      workflow.fail(first, "boom");

      expect(workflow.find(second)?.status).toBe("loading");
      workflow.end(second);
      expect(workflow.state.pending.map((op) => op.id)).toEqual([first]);
    });
  });

  describe("receipts", () => {
    it("publishes and dismisses a receipt", () => {
      workflow.present(receipt());
      expect(workflow.state.result?.summary).toBe("2 items created");

      workflow.dismissResult();
      expect(workflow.state.result).toBeNull();
    });

    it("navigates to the result and clears the receipt", async () => {
      workflow.present(receipt());
      await workflow.openResult();

      expect(host.navigations).toHaveLength(1);
      expect(workflow.state.result).toBeNull();
    });

    it("does nothing when there is no receipt to open", async () => {
      await workflow.openResult();
      expect(host.navigations).toEqual([]);
    });
  });

  describe("undo", () => {
    it("offers nothing to undo before any run is recorded", async () => {
      expect(await workflow.undoLast()).toBe(false);
      expect(workflow.state.undoableOperationId).toBeNull();
    });

    it("makes a completed run undoable", async () => {
      const id = await runAndRecord();
      expect(workflow.state.undoableOperationId).toBe(id);
      expect(await operationLog.getRecord(id)).not.toBeNull();
    });

    it("reverses the run, forgets the removed cards, and reloads", async () => {
      await runAndRecord();
      workflow.present(receipt());

      expect(await workflow.undoLast()).toBe(true);
      expect(host.forgotten[0]).toHaveLength(2);
      expect(host.refreshes).toBe(1);
      expect(await cardRepo.getCardsByWorkspace("w1")).toEqual([]);
      expect(workflow.state.undoableOperationId).toBeNull();
      expect(workflow.state.result).toBeNull();
      expect(host.messages).toHaveLength(1);
    });

    it("cannot undo the same run twice", async () => {
      await runAndRecord();
      await workflow.undoLast();
      expect(await workflow.undoLast()).toBe(false);
    });

    it("refuses — leaving everything in place — when a created card was edited", async () => {
      await runAndRecord();
      const [edited] = await cardRepo.getCardsByWorkspace("w1");
      await cardRepo.saveCard({ ...edited, body: "the user wrote this" });
      host.cardList = await cardRepo.getCardsByWorkspace("w1");

      expect(await workflow.undoLast()).toBe(false);
      expect(await cardRepo.getCardsByWorkspace("w1")).toHaveLength(2);
      expect(host.forgotten).toEqual([]);
      expect(host.messages[0]).toBeTruthy();
      // The offer is withdrawn rather than left dangling on an un-undoable run.
      expect(workflow.state.undoableOperationId).toBeNull();
    });

    it("drops the offer when the record itself has gone", async () => {
      const id = await runAndRecord();
      await operationLog.deleteRecord(id);

      expect(await workflow.undoLast()).toBe(false);
      expect(workflow.state.undoableOperationId).toBeNull();
    });
  });
});
