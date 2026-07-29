import { describe, expect, it } from "bun:test";
import { UndoOperationInteractor, UndoUnavailableError } from "../UndoOperationInteractor";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { MemoryOperationLogRepository } from "../../../adapters/repositories/MemoryOperationLogRepository";
import { createCard } from "../../../entities/card";
import { createOperationRecord } from "../../../entities/operationLog";

async function setup(cards: ReturnType<typeof createCard>[]) {
  const cardRepo = new MemoryCardRepository();
  const log = new MemoryOperationLogRepository();
  await cardRepo.saveCards(cards);
  return { cardRepo, log, interactor: new UndoOperationInteractor(cardRepo, log) };
}

const made = (id: string) =>
  createCard({ id, workspaceId: "w", type: "chunk", title: `T-${id}`, body: `B-${id}` });

function recordFor(cards: ReturnType<typeof createCard>[]) {
  return createOperationRecord({
    commandName: 'ask "x"',
    workspaceId: "w",
    createdCardIds: cards.map(c => c.id),
    createdCardSnapshots: cards.map(c => ({ ...c })),
    startedAt: Date.now(),
    summary: `${cards.length} created`,
  });
}

describe("UndoOperationInteractor", () => {
  it("removes the cards a run created and clears the record", async () => {
    const cards = [made("a"), made("b")];
    const { cardRepo, log, interactor } = await setup(cards);
    const record = recordFor(cards);
    await log.saveRecord(record);

    const result = await interactor.execute(record, cards);

    expect(result.removedCardIds).toEqual(["a", "b"]);
    expect(await cardRepo.getCardsByWorkspace("w")).toHaveLength(0);
    // The record is gone, so the same undo can't be offered twice.
    expect(await log.getRecord(record.id)).toBeNull();
  });

  it("refuses — and changes nothing — when a created card has been edited since", async () => {
    const cards = [made("a"), made("b")];
    const { cardRepo, interactor } = await setup(cards);
    const record = recordFor(cards);

    const edited = [{ ...cards[0], body: "the user rewrote this" }, cards[1]];

    const error = await interactor.execute(record, edited).catch(e => e);

    expect(error).toBeInstanceOf(UndoUnavailableError);
    expect(error.userMessage).toContain("edited");
    // The guarantee that matters: nothing was half-applied.
    expect(await cardRepo.getCardsByWorkspace("w")).toHaveLength(2);
  });

  it("refuses rather than half-reversing when only some cards still exist", async () => {
    const cards = [made("a"), made("b")];
    const { cardRepo, interactor } = await setup(cards);
    const record = recordFor(cards);

    // "b" was deleted by hand after the run.
    const error = await interactor.execute(record, [cards[0]]).catch(e => e);

    expect(error).toBeInstanceOf(UndoUnavailableError);
    expect(error.userMessage).toContain("half-reversed");
    expect(await cardRepo.getCardsByWorkspace("w")).toHaveLength(2);
  });

  it("reports already-gone cards without claiming to have undone anything", async () => {
    const cards = [made("a")];
    const { log, interactor } = await setup([]);
    const record = recordFor(cards);
    await log.saveRecord(record);

    const error = await interactor.execute(record, []).catch(e => e);

    expect(error).toBeInstanceOf(UndoUnavailableError);
    expect(error.userMessage).toContain("already gone");
    // The stale record is cleaned up, since there's nothing left it could reverse.
    expect(await log.getRecord(record.id)).toBeNull();
  });

  it("refuses an operation that created nothing", async () => {
    const { interactor } = await setup([]);
    const record = createOperationRecord({
      commandName: "move",
      workspaceId: "w",
      startedAt: Date.now(),
      summary: "moved",
    });

    const error = await interactor.execute(record, []).catch(e => e);

    expect(error).toBeInstanceOf(UndoUnavailableError);
    expect(error.userMessage).toContain("didn't create anything");
  });

  it("restores cards the run had moved, not just the ones it created", async () => {
    const created = made("new");
    // A card that existed before and was re-parented into the run's new group.
    const movedBefore = createCard({ id: "old", workspaceId: "w", type: "note", title: "Old", body: "B" });
    const movedAfter = { ...movedBefore, parentId: "new-group" };

    const { cardRepo, interactor } = await setup([created, movedAfter]);
    const record = createOperationRecord({
      commandName: "group",
      workspaceId: "w",
      createdCardIds: [created.id],
      createdCardSnapshots: [{ ...created }],
      updatedCardSnapshots: [movedBefore],
      startedAt: Date.now(),
      summary: "grouped",
    });

    await interactor.execute(record, [created, movedAfter]);

    const remaining = await cardRepo.getCardsByWorkspace("w");
    expect(remaining).toHaveLength(1);
    // Undo returns the workspace to its shape, not just deletes the new parts.
    expect(remaining[0].parentId).toBeUndefined();
  });
});
