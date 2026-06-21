import { describe, expect, it } from "bun:test";
import { createCard } from "../../../entities/card";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { AgentGateway } from "../../../adapters/gateways/AgentGateway";
import { ChunkCommand } from "../ChunkCommand";
import { CommandContext } from "../Command";

/** Agent that must never be called on the default (no API key) faithful path. */
const explodingAgent: AgentGateway = {
  ask: async () => {
    throw new Error("agent should not be called for faithful chunking");
  },
  fetchModels: async () => [],
};

function ctx(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    workspaceId: "ws-1",
    parentId: null,
    inputCards: [],
    workspaces: [],
    apiKey: "",
    model: "m",
    systemPrompt: "p",
    chunkSystemPrompt: "cp",
    expansionStack: [],
    ...overrides,
  };
}

const STRUCTURED = `# Chapter 1
Intro to chapter one.

## Section 1.1
Content of section 1.1 here.

## Section 1.2
Content of section 1.2 here.`;

describe("ChunkCommand — faithful structural chunking", () => {
  it("mirrors the source heading hierarchy as nested groups + chunks, no API key", async () => {
    const repo = new MemoryCardRepository();
    const cmd = new ChunkCommand(explodingAgent, repo);
    const source = createCard({ workspaceId: "ws-1", type: "source", title: "Doc", body: STRUCTURED, cite: "doc.md" });

    const result = await cmd.execute("", ctx({ inputCards: [source] }));

    expect(result.kind).toBe("cards");
    if (result.kind !== "cards") return;

    const groups = result.cards.filter(c => c.type === "group");
    const chunks = result.cards.filter(c => c.type === "chunk");
    expect(groups.length).toBe(1);
    expect(groups[0].title).toBe("Chapter 1");

    // Section leaves mirror the real subheadings and nest under the chapter group.
    const titles = chunks.map(c => c.title);
    expect(titles).toContain("Section 1.1");
    expect(titles).toContain("Section 1.2");
    const leaves = chunks.filter(c => c.title.startsWith("Section"));
    expect(leaves.every(c => c.parentId === groups[0].id)).toBe(true);

    // Every produced card is anchored back to the source.
    expect(result.cards.every(c => c.sourceRef === source.id && c.cite === "doc.md")).toBe(true);
  });

  it("falls back to paragraph chunking for unstructured text", async () => {
    const repo = new MemoryCardRepository();
    const cmd = new ChunkCommand(explodingAgent, repo);
    const source = createCard({
      workspaceId: "ws-1",
      type: "source",
      title: "Plain",
      body: "First paragraph with enough words here.\n\nSecond paragraph with enough words here.",
    });

    const result = await cmd.execute("", ctx({ inputCards: [source] }));

    expect(result.kind).toBe("cards");
    if (result.kind !== "cards") return;
    expect(result.cards.length).toBeGreaterThan(0);
    expect(result.cards.every(c => c.type === "chunk")).toBe(true);
  });
});
