import { describe, expect, it, beforeEach, mock } from "bun:test";
import { SourceCommand } from "../SourceCommand";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { ExtractionGateway } from "../../ports/gateways/ExtractionGateway";
import { CommandContext } from "../Command";

/**
 * # SourceCommand Test Specification
 *
 * ## Business Intent & Rationale
 * Ingesting material into ChunkBuddy must fetch and normalize URLs into readable Markdown
 * source items via deterministic extraction infrastructure. `SourceCommand` should not
 * save raw URL strings as card bodies when given a URL; instead, it uses the injected
 * `ExtractionGateway` to extract the main document text.
 *
 * ## Applied Design Pattern
 * - **Command Pattern**: Encapsulates pipeline source ingestion in a single executable object.
 * - **Adapter / Strategy Pattern**: Leverages `ExtractionGateway` interface for fetching/parsing.
 */
describe("SourceCommand Use Case & Pipeline Ingestion", () => {
  let cardRepo: MemoryCardRepository;
  let mockExtractionGateway: ExtractionGateway;
  let sourceCommand: SourceCommand;

  const mockCtx: CommandContext = {
    workspaceId: "ws-source-test",
    parentId: null,
    inputCards: [],
    workspaces: [],
    apiKey: "key",
    model: "model",
    systemPrompt: "prompt",
    chunkSystemPrompt: "chunkPrompt",
    expansionStack: [],
  };

  beforeEach(() => {
    cardRepo = new MemoryCardRepository();
    mockExtractionGateway = {
      extractText: mock(async (url: string) => `# Extracted Document\n\nContent for ${url}`),
    };
    sourceCommand = new SourceCommand(cardRepo, mockExtractionGateway);
  });

  it("should halt and signal needsInput when arg is empty", async () => {
    const result = await sourceCommand.execute("", mockCtx);
    expect(result.kind).toBe("needsInput");
    if (result.kind === "needsInput") {
      expect(result.mode).toBe("source");
    }
  });

  it("should create a source item from plain text directly without calling extraction gateway", async () => {
    const result = await sourceCommand.execute("This is direct pasted text content", mockCtx);
    expect(result.kind).toBe("cards");
    if (result.kind === "cards") {
      expect(result.cards).toHaveLength(1);
      const card = result.cards[0];
      expect(card.type).toBe("source");
      expect(card.body).toBe("This is direct pasted text content");
      expect(card.cite).toBe("user source");
    }
    expect(mockExtractionGateway.extractText).not.toHaveBeenCalled();
  });

  it("should fetch and extract readable markdown when arg is a URL", async () => {
    const url = "https://en.wikipedia.org/wiki/Quantum_computing";
    const result = await sourceCommand.execute(url, mockCtx);

    expect(mockExtractionGateway.extractText).toHaveBeenCalledWith(url);
    expect(result.kind).toBe("cards");

    if (result.kind === "cards") {
      expect(result.cards).toHaveLength(1);
      const card = result.cards[0];
      expect(card.type).toBe("source");
      expect(card.body).toBe(`# Extracted Document\n\nContent for ${url}`);
      expect(card.cite).toBe(url);
      expect(card.title).toBe("Quantum computing");
    }
  });
});
