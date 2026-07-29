import { describe, expect, it, beforeEach } from "bun:test";
import { NoteCommand } from "../NoteCommand";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { CreateNote } from "../../card/CreateNote";
import { CommandContext } from "../Command";

/**
 * # NoteCommand Pipeline Integration Specification
 *
 * ## Business Value & Purpose
 * Allows direct, fast note capture within pipeline command strings (e.g. `note "Dungeon acoustics concept"`).
 * Executes the `CreateNote` application use case without requiring AI gateways or auto-grouping.
 *
 * ## Applied Design Pattern
 * - **Command Pattern**: Adapts the `CreateNote` use case to the `PipelineCommand` interface.
 */
describe("NoteCommand Pipeline Command", () => {
  let cardRepo: MemoryCardRepository;
  let createNoteUseCase: CreateNote;
  let noteCommand: NoteCommand;

  const mockCtx: CommandContext = {
    workspaceId: "ws-note-cmd",
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
    createNoteUseCase = new CreateNote(cardRepo);
    noteCommand = new NoteCommand(createNoteUseCase);
  });

  it("should halt with needsInput if given empty argument", async () => {
    const result = await noteCommand.execute("", mockCtx);
    expect(result.kind).toBe("needsInput");
    if (result.kind === "needsInput") {
      expect(result.mode).toBe("source");
    }
  });

  it("should execute CreateNote use case and return the created note card", async () => {
    const result = await noteCommand.execute("Procedural generation idea", mockCtx);
    expect(result.kind).toBe("cards");

    if (result.kind === "cards") {
      expect(result.cards).toHaveLength(1);
      const note = result.cards[0];
      expect(note.type).toBe("note");
      expect(note.body).toBe("Procedural generation idea");
      expect(note.workspaceId).toBe("ws-note-cmd");
    }
  });
});
