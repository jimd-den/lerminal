import { describe, expect, it, beforeEach } from "bun:test";
import { SpaceCommand } from "../SpaceCommand";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { createCard } from "../../../entities/card";
import { CommandContext } from "../Command";

/**
 * # SpaceCommand Test Specification
 *
 * ## Business Value & Rationale
 * `space` enrolls all schedulable study cards (question, cloze, elaboration, etc.) into FSRS
 * scheduling. Working memory notes and sources are filtered out and remain unscheduled.
 */
describe("SpaceCommand Pipeline Unit Tests", () => {
  let cardRepo: MemoryCardRepository;
  let spaceCommand: SpaceCommand;

  const mockCtx: CommandContext = {
    workspaceId: "ws-space-test",
    parentId: null,
    inputCards: [],
    workspaces: [],
    apiKey: "",
    model: "",
    systemPrompt: "",
    chunkSystemPrompt: "",
    expansionStack: [],
  };

  beforeEach(() => {
    cardRepo = new MemoryCardRepository();
    spaceCommand = new SpaceCommand(cardRepo);
  });

  it("should enroll question, cloze, and elaboration cards while filtering out notes and sources", async () => {
    const noteCard = createCard({ workspaceId: "ws-space-test", type: "note", title: "Note", body: "Text" });
    const sourceCard = createCard({ workspaceId: "ws-space-test", type: "source", title: "Source", body: "URL" });
    const questionCard = createCard({ workspaceId: "ws-space-test", type: "question", title: "Q?", body: "Ans" });
    const clozeCard = createCard({ workspaceId: "ws-space-test", type: "cloze", title: "Cloze", body: "{{ans}}" });
    const elaborationCard = createCard({ workspaceId: "ws-space-test", type: "elaboration", title: "Elab", body: "Exp" });

    const ctx = {
      ...mockCtx,
      inputCards: [noteCard, sourceCard, questionCard, clozeCard, elaborationCard],
    };

    const result = await spaceCommand.execute("", ctx);

    expect(result.kind).toBe("cards");
    if (result.kind === "cards") {
      expect(result.cards).toHaveLength(3);
      const types = result.cards.map(c => c.type);
      expect(types).toContain("question");
      expect(types).toContain("cloze");
      expect(types).toContain("elaboration");
      expect(types).not.toContain("note");
      expect(types).not.toContain("source");

      // Verify all enrolled cards carry an initialized schedule
      expect(result.cards.every(c => c.schedule !== undefined)).toBe(true);
    }
  });
});
