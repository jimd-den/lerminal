import { describe, expect, it, beforeEach } from "bun:test";
import { ChunkCommand } from "../ChunkCommand";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { createCard } from "../../../entities/card";
import { CommandContext } from "../Command";
import { AgentGateway, AgentAskResult, AgentCardResponse, AgentModel } from "../../ports/gateways/AgentGateway";

class MockChunkAgentGateway implements AgentGateway {
  lastQuery?: string;
  lastContextCards?: any[];
  lastOutputContract?: string;
  callCount = 0;

  async ask(
    query: string,
    contextCards: any[],
    apiKey: string,
    model: string,
    systemPrompt?: string,
    outputContract?: any
  ): Promise<AgentAskResult> {
    this.callCount++;
    this.lastQuery = query;
    this.lastContextCards = contextCards;
    this.lastOutputContract = outputContract;
    const sourceId = contextCards[0]?.id;
    const sourceTitle = contextCards[0]?.title || "Source";
    return { cards: [
      {
        title: `${sourceTitle} · Chunk 1`,
        body: `Focused explanation for ${sourceTitle}`,
        sourceCardId: sourceId,
        sourceExcerpt: `Quote from ${sourceTitle}`,
      },
      {
        title: `${sourceTitle} · Chunk 2`,
        body: `Second concept for ${sourceTitle}`,
        sourceCardId: sourceId,
        sourceExcerpt: `Another quote from ${sourceTitle}`,
      },
    ], isLocalFallback: false };
  }

  async fetchModels(): Promise<AgentModel[]> {
    return [];
  }
}

describe("ChunkCommand AI-Assisted Semantic Chunking Unit Tests", () => {
  let cardRepo: MemoryCardRepository;
  let agentGateway: MockChunkAgentGateway;
  let chunkCmd: ChunkCommand;

  const mockCtx: CommandContext = {
    workspaceId: "ws-chunk-ai",
    parentId: null,
    inputCards: [],
    workspaces: [],
    apiKey: "test-api-key",
    model: "test-model",
    systemPrompt: "system prompt",
    chunkSystemPrompt: "chunk prompt",
    expansionStack: [],
  };

  beforeEach(() => {
    cardRepo = new MemoryCardRepository();
    agentGateway = new MockChunkAgentGateway();
    chunkCmd = new ChunkCommand(agentGateway, cardRepo);
  });

  it("should run deterministic structural splitting when --faithful flag is passed", async () => {
    const markdownSource = createCard({
      workspaceId: "ws-chunk-ai",
      type: "source",
      title: "Doc",
      body: "# Title\n\nBody content.",
    });

    const ctx = { ...mockCtx, inputCards: [markdownSource] };
    const result = await chunkCmd.execute("--faithful", ctx);

    expect(result.kind).toBe("cards");
    expect(agentGateway.lastQuery).toBeUndefined(); // Agent should NOT be called for --faithful
  });

  it("should run deterministic structural splitting when no API key is provided", async () => {
    const markdownSource = createCard({
      workspaceId: "ws-chunk-ai",
      type: "source",
      title: "Doc",
      body: "# Title\n\nBody content.",
    });

    const ctx = { ...mockCtx, apiKey: "", inputCards: [markdownSource] };
    const result = await chunkCmd.execute("Goal", ctx);

    expect(result.kind).toBe("cards");
    expect(agentGateway.lastQuery).toBeUndefined();
  });

  it("should call AI model and create semantic chunks when goal argument is provided with API key", async () => {
    const noteCard = createCard({
      workspaceId: "ws-chunk-ai",
      type: "note",
      title: "Study Material",
      body: "Deep neural network architectures use gradient descent.",
    });

    const ctx = { ...mockCtx, inputCards: [noteCard] };
    const result = await chunkCmd.execute("Extract neural network learning principles", ctx);

    expect(result.kind).toBe("cards");
    if (result.kind === "cards") {
      expect(result.cards.length).toBe(2);
      expect(result.cards[0].title).toBe("Study Material · Chunk 1");
      expect(result.cards[0].sourceRef).toBe(noteCard.id);
      expect(result.cards[0].cite).toBe("Quote from Study Material");
    }
    expect(agentGateway.lastQuery).toBe("Extract neural network learning principles");
    // The resolved chunk-document profile's chunks-v1 contract must reach the gateway,
    // so it isn't silently coerced into the generic cards-v1 shape.
    expect(agentGateway.lastOutputContract).toBe("chunks-v1");
  });

  it("should create distinct focused chunks per source when chunking multiple cards", async () => {
    const cardA = createCard({ workspaceId: "ws-chunk-ai", type: "note", title: "Article A", body: "Content A" });
    const cardB = createCard({ workspaceId: "ws-chunk-ai", type: "note", title: "Article B", body: "Content B" });
    await cardRepo.saveCards([cardA, cardB]);

    const ctx = { ...mockCtx, inputCards: [cardA, cardB] };
    const result = await chunkCmd.execute("Goal", ctx);

    expect(result.kind).toBe("cards");
    if (result.kind === "cards") {
      // 2 focused chunks for Card A + 2 focused chunks for Card B = 4 total chunks
      expect(result.cards.length).toBe(4);

      const chunksForA = result.cards.filter(c => c.sourceRef === cardA.id);
      const chunksForB = result.cards.filter(c => c.sourceRef === cardB.id);

      expect(chunksForA).toHaveLength(2);
      expect(chunksForB).toHaveLength(2);

      // Verify focused titles
      expect(chunksForA[0].title).toContain("Article A");
      expect(chunksForB[0].title).toContain("Article B");

      // Verify each set of chunks is placed inside its respective source's document group
      const updatedA = await cardRepo.getCard(cardA.id);
      const updatedB = await cardRepo.getCard(cardB.id);

      expect(chunksForA.every(c => c.parentId === updatedA?.parentId)).toBe(true);
      expect(chunksForB.every(c => c.parentId === updatedB?.parentId)).toBe(true);
      expect(updatedA?.parentId).not.toBe(updatedB?.parentId);
    }

    expect(agentGateway.callCount).toBe(2);
  });

  it("should throw EmptySelectionError when input selection has no source/note/chunk cards", async () => {
    const questionCard = createCard({
      workspaceId: "ws-chunk-ai",
      type: "question",
      title: "Q?",
      body: "A",
    });

    const ctx = { ...mockCtx, inputCards: [questionCard] };
    expect(chunkCmd.execute("Goal", ctx)).rejects.toThrow();
  });
});
