import { describe, expect, it } from "bun:test";
import { LinkCardsInteractor, CardNotFoundError, DuplicateCardLinkError } from "../LinkCardsInteractor";
import { MemoryCardLinkRepository } from "../../../adapters/repositories/MemoryCardLinkRepository";
import { createCard } from "../../../entities/card";

describe("LinkCardsInteractor", () => {
  it("creates a link for two valid cards", async () => {
    const repo = new MemoryCardLinkRepository();
    const interactor = new LinkCardsInteractor(repo);
    const a = createCard({ workspaceId: "w1", type: "note", title: "A", body: "" });
    const b = createCard({ workspaceId: "w1", type: "note", title: "B", body: "" });

    const link = await interactor.execute({
      workspaceId: "w1",
      fromCardId: a.id,
      toCardId: b.id,
      relation: "Related to",
      cards: [a, b],
    });

    expect(link.fromCardId).toBe(a.id);
    expect(link.toCardId).toBe(b.id);
    expect(link.relation).toBe("Related to");
    expect(await repo.getLinksByWorkspace("w1")).toHaveLength(1);
  });

  it("rejects if either card id doesn't exist in the workspace", async () => {
    const repo = new MemoryCardLinkRepository();
    const interactor = new LinkCardsInteractor(repo);
    const a = createCard({ workspaceId: "w1", type: "note", title: "A", body: "" });

    await expect(
      interactor.execute({
        workspaceId: "w1",
        fromCardId: a.id,
        toCardId: "missing",
        cards: [a],
      }),
    ).rejects.toBeInstanceOf(CardNotFoundError);

    expect(await repo.getLinksByWorkspace("w1")).toHaveLength(0);
  });

  it("rejects an exact duplicate link", async () => {
    const repo = new MemoryCardLinkRepository();
    const interactor = new LinkCardsInteractor(repo);
    const a = createCard({ workspaceId: "w1", type: "note", title: "A", body: "" });
    const b = createCard({ workspaceId: "w1", type: "note", title: "B", body: "" });

    await interactor.execute({
      workspaceId: "w1",
      fromCardId: a.id,
      toCardId: b.id,
      relation: "Supports",
      cards: [a, b],
    });

    await expect(
      interactor.execute({
        workspaceId: "w1",
        fromCardId: a.id,
        toCardId: b.id,
        relation: "Supports",
        cards: [a, b],
      }),
    ).rejects.toBeInstanceOf(DuplicateCardLinkError);

    expect(await repo.getLinksByWorkspace("w1")).toHaveLength(1);
  });

  it("allows a different relation between the same two cards (not a duplicate)", async () => {
    const repo = new MemoryCardLinkRepository();
    const interactor = new LinkCardsInteractor(repo);
    const a = createCard({ workspaceId: "w1", type: "note", title: "A", body: "" });
    const b = createCard({ workspaceId: "w1", type: "note", title: "B", body: "" });

    await interactor.execute({
      workspaceId: "w1",
      fromCardId: a.id,
      toCardId: b.id,
      relation: "Supports",
      cards: [a, b],
    });
    await interactor.execute({
      workspaceId: "w1",
      fromCardId: a.id,
      toCardId: b.id,
      relation: "Questions",
      cards: [a, b],
    });

    expect(await repo.getLinksByWorkspace("w1")).toHaveLength(2);
  });

  it("is workspace-scoped — doesn't leak across workspaces", async () => {
    const repo = new MemoryCardLinkRepository();
    const interactor = new LinkCardsInteractor(repo);
    const a = createCard({ workspaceId: "w1", type: "note", title: "A", body: "" });
    const b = createCard({ workspaceId: "w1", type: "note", title: "B", body: "" });
    const c = createCard({ workspaceId: "w2", type: "note", title: "C", body: "" });

    await interactor.execute({
      workspaceId: "w1",
      fromCardId: a.id,
      toCardId: b.id,
      cards: [a, b],
    });

    // A card that exists, but in a different workspace than requested, is not valid.
    await expect(
      interactor.execute({
        workspaceId: "w2",
        fromCardId: a.id,
        toCardId: c.id,
        cards: [a, c],
      }),
    ).rejects.toBeInstanceOf(CardNotFoundError);

    expect(await repo.getLinksByWorkspace("w1")).toHaveLength(1);
    expect(await repo.getLinksByWorkspace("w2")).toHaveLength(0);
  });
});
