import { describe, expect, it } from "bun:test";
import { MemoryCardRepository } from "../MemoryCardRepository";
import { MemoryWorkspaceRepository } from "../MemoryWorkspaceRepository";
import { createCard } from "../../../entities/card";
import { createWorkspace } from "../../../entities/workspace";

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
});
