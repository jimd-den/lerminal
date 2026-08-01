import { describe, expect, it, beforeEach } from "bun:test";
import { SplitCommand } from "../SplitCommand";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { createCard } from "../../../entities/card";
import { CommandContext } from "../Command";

/**
 * # SplitCommand Test Specification
 *
 * ## Business Value & Rationale
 * `split` performs offline, deterministic Markdown and paragraph splitting. It preserves
 * document structure (H1..H3 headings and subheadings) without requiring AI or API keys.
 */
describe("SplitCommand Pipeline Unit Tests", () => {
  let cardRepo: MemoryCardRepository;
  let splitCmd: SplitCommand;

  const mockCtx: CommandContext = {
    workspaceId: "ws-split",
    parentId: null,
    inputCards: [],
    workspaces: [],
    apiKey: "",
    model: "test-model",
    systemPrompt: "",
    chunkSystemPrompt: "",
    expansionStack: [],
  };

  beforeEach(() => {
    cardRepo = new MemoryCardRepository();
    splitCmd = new SplitCommand(cardRepo);
  });

  it("should deterministically split markdown source cards by headings", async () => {
    const markdownSource = createCard({
      workspaceId: "ws-split",
      type: "source",
      title: "Document",
      body: "# Chapter 1\n\nIntro text.\n\n## Section A\n\nDetailed content for section A.",
    });

    const ctx = { ...mockCtx, inputCards: [markdownSource] };
    const result = await splitCmd.execute("", ctx);

    expect(result.kind).toBe("cards");
    if (result.kind === "cards") {
      expect(result.cards.length).toBeGreaterThan(0);
      expect(result.cards.some(c => c.title.includes("Chapter 1"))).toBe(true);
      expect(result.cards.some(c => c.title.includes("Section A"))).toBe(true);
    }
  });

  it("should split plain prose notes by paragraph when no headings exist", async () => {
    const proseNote = createCard({
      workspaceId: "ws-split",
      type: "note",
      title: "Plain Note",
      body: "Paragraph 1 text here.\n\nParagraph 2 text here.",
    });

    const ctx = { ...mockCtx, inputCards: [proseNote] };
    const result = await splitCmd.execute("", ctx);

    expect(result.kind).toBe("cards");
    if (result.kind === "cards") {
      expect(result.cards.length).toBe(2);
      expect(result.cards[0].body).toContain("Paragraph 1");
      expect(result.cards[1].body).toContain("Paragraph 2");
    }
  });

  it("should throw EmptySelectionError when input has no chunkable source/note cards", async () => {
    const questionCard = createCard({
      workspaceId: "ws-split",
      type: "question",
      title: "Q?",
      body: "Ans",
    });

    const ctx = { ...mockCtx, inputCards: [questionCard] };
    expect(splitCmd.execute("", ctx)).rejects.toThrow();
  });
});
