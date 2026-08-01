import { describe, expect, it } from "bun:test";
import { MemoryCardRepository } from "../MemoryCardRepository";
import { MemoryWorkspaceRepository } from "../MemoryWorkspaceRepository";
import { MemoryOperationLogRepository } from "../MemoryOperationLogRepository";
import { MemoryCardLinkRepository } from "../MemoryCardLinkRepository";
import { createCard } from "../../../entities/card";
import { createWorkspace } from "../../../entities/workspace";
import { createOperationRecord } from "../../../entities/operationLog";
import { createCardLink } from "../../../entities/cardLink";

describe("Memory Repositories", () => {
  it("should save and retrieve cards by workspace", async () => {
    const cardRepo = new MemoryCardRepository();
    
    const card1 = createCard({ workspaceId: "ws-a", type: "chunk", title: "C1", body: "B1" });
    const card2 = createCard({ workspaceId: "ws-a", type: "chunk", title: "C2", body: "B2" });
    const card3 = createCard({ workspaceId: "ws-b", type: "chunk", title: "C3", body: "B3" });

    await cardRepo.saveCard(card1);
    await cardRepo.saveCards([card2, card3]);

    const wsACards = await cardRepo.getCardsByWorkspace("ws-a");
    expect(wsACards.length).toBe(2);
    expect(wsACards.map(c => c.id)).toContain(card1.id);
    expect(wsACards.map(c => c.id)).toContain(card2.id);

    const wsBCards = await cardRepo.getCardsByWorkspace("ws-b");
    expect(wsBCards.length).toBe(1);
    expect(wsBCards[0].id).toBe(card3.id);
  });

  it("should save and retrieve workspaces", async () => {
    const wsRepo = new MemoryWorkspaceRepository();
    const ws1 = createWorkspace({ name: "W1" });
    const ws2 = createWorkspace({ name: "W2" });

    await wsRepo.saveWorkspace(ws1);
    await wsRepo.saveWorkspace(ws2);

    const workspaces = await wsRepo.getWorkspaces();
    expect(workspaces.length).toBe(2);
    expect(workspaces.map(w => w.id)).toContain(ws1.id);
    expect(workspaces.map(w => w.id)).toContain(ws2.id);
  });

  it("should save, scope-by-workspace, and delete operation records (run receipts)", async () => {
    const logRepo = new MemoryOperationLogRepository();
    const now = Date.now();
    const recordA = createOperationRecord({
      commandName: "ask",
      workspaceId: "ws-a",
      startedAt: now - 1000,
      completedAt: now - 1000,
      summary: "1 chunk created",
    });
    const recordB = createOperationRecord({
      commandName: "search",
      workspaceId: "ws-a",
      startedAt: now,
      completedAt: now,
      webUsed: true,
      searchQuery: "eigenvectors",
      summary: "5 results found",
    });
    const recordC = createOperationRecord({
      commandName: "note",
      workspaceId: "ws-b",
      startedAt: now,
      summary: "1 note created",
    });

    await logRepo.saveRecord(recordA);
    await logRepo.saveRecord(recordB);
    await logRepo.saveRecord(recordC);

    const wsARecords = await logRepo.getRecords("ws-a");
    expect(wsARecords.length).toBe(2);
    // Most recent first.
    expect(wsARecords[0].id).toBe(recordB.id);

    expect(await logRepo.getRecord(recordC.id)).not.toBeNull();
    expect(await logRepo.getRecord("missing-id")).toBeNull();

    await logRepo.deleteRecord(recordA.id);
    expect(await logRepo.getRecord(recordA.id)).toBeNull();
    expect((await logRepo.getRecords("ws-a")).length).toBe(1);
  });

  it("should save and scope card links by workspace and by card", async () => {
    const linkRepo = new MemoryCardLinkRepository();
    const linkA = createCardLink({ workspaceId: "ws-a", fromCardId: "c1", toCardId: "c2" });
    const linkB = createCardLink({ workspaceId: "ws-a", fromCardId: "c2", toCardId: "c3" });
    const linkC = createCardLink({ workspaceId: "ws-b", fromCardId: "c4", toCardId: "c5" });

    await linkRepo.saveLink(linkA);
    await linkRepo.saveLink(linkB);
    await linkRepo.saveLink(linkC);

    const wsALinks = await linkRepo.getLinksByWorkspace("ws-a");
    expect(wsALinks.map((l) => l.id).sort()).toEqual([linkA.id, linkB.id].sort());

    const wsBLinks = await linkRepo.getLinksByWorkspace("ws-b");
    expect(wsBLinks).toHaveLength(1);
    expect(wsBLinks[0].id).toBe(linkC.id);

    const c2Links = await linkRepo.getLinksByCard("c2");
    expect(c2Links.map((l) => l.id).sort()).toEqual([linkA.id, linkB.id].sort());
  });
});
