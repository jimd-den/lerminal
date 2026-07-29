import { describe, expect, it, beforeEach } from "bun:test";
import { SplitCommand } from "../SplitCommand";
import { ChunkCommand } from "../ChunkCommand";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { createCard } from "../../../entities/card";
import { CommandContext } from "../Command";
import { AgentGateway, AgentAskResult, AgentCardResponse, AgentModel } from "../../../adapters/gateways/AgentGateway";

class MockAgentGateway implements AgentGateway {
  async ask(query: string, contextCards: any[]): Promise<AgentAskResult> {
    return { cards: [
      { title: "Semantic Chunk 1", body: "Explanation 1", sourceCardId: contextCards[0]?.id },
      { title: "Semantic Chunk 2", body: "Explanation 2", sourceCardId: contextCards[0]?.id },
    ], isLocalFallback: false };
  }
  async fetchModels(): Promise<AgentModel[]> { return []; }
}

describe("Document Container Grouping during Chunking & Splitting", () => {
  let cardRepo: MemoryCardRepository;
  let splitCmd: SplitCommand;
  let chunkCmd: ChunkCommand;

  const mockCtx: CommandContext = {
    workspaceId: "ws-doc-group",
    parentId: null,
    inputCards: [],
    workspaces: [],
    apiKey: "key",
    model: "model",
    systemPrompt: "",
    chunkSystemPrompt: "",
    expansionStack: [],
  };

  beforeEach(() => {
    cardRepo = new MemoryCardRepository();
    splitCmd = new SplitCommand(cardRepo);
    chunkCmd = new ChunkCommand(new MockAgentGateway(), cardRepo);
  });

  it("SplitCommand should create a document group, move the source inside it, and place chunks inside it", async () => {
    const article = createCard({
      workspaceId: "ws-doc-group",
      type: "source",
      title: "Rendering Pipeline Article",
      body: "Paragraph 1 text.\n\nParagraph 2 text.",
    });
    await cardRepo.saveCard(article);

    const ctx = { ...mockCtx, inputCards: [article] };
    const result = await splitCmd.execute("", ctx);

    expect(result.kind).toBe("cards");
    
    // Fetch updated source from repo
    const updatedSource = await cardRepo.getCard(article.id);
    expect(updatedSource?.parentId).toBeDefined();

    // Verify document group exists
    const docGroup = await cardRepo.getCard(updatedSource!.parentId!);
    expect(docGroup).toBeDefined();
    expect(docGroup?.type).toBe("group");
    expect(docGroup?.title).toBe("Rendering Pipeline Article");
    expect(docGroup?.documentGroupFor).toBe(article.id);

    // Verify chunks are inside the document group
    if (result.kind === "cards") {
      const chunks = result.cards.filter(c => c.type === "chunk");
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.every(c => c.parentId === docGroup?.id)).toBe(true);
    }
  });

  it("ChunkCommand should reuse existing document group on re-chunking without creating duplicate nested groups", async () => {
    const note = createCard({
      workspaceId: "ws-doc-group",
      type: "note",
      title: "My Research Note",
      body: "Note body text.",
    });
    await cardRepo.saveCard(note);

    const ctx = { ...mockCtx, inputCards: [note] };
    
    // First run
    await chunkCmd.execute("Goal 1", ctx);

    const updatedNote = await cardRepo.getCard(note.id);
    const firstGroup = await cardRepo.getCard(updatedNote!.parentId!);
    expect(firstGroup?.documentGroupFor).toBe(note.id);

    // Second run with new goal
    await chunkCmd.execute("Goal 2", ctx);

    const allCards = await cardRepo.getCardsByWorkspace("ws-doc-group");
    const docGroups = allCards.filter(c => c.type === "group" && c.documentGroupFor === note.id);
    
    // Should NOT duplicate document group
    expect(docGroups).toHaveLength(1);
  });
});
