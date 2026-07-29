import { describe, expect, it, beforeEach } from "bun:test";
import { CreateNote } from "../CreateNote";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";

/**
 * # CreateNote Use Case Specification & Whitepaper Test Suite
 *
 * ## Business Intent & Rationale
 * Capturing a note is the most fundamental, privileged operation in ChunkBuddy.
 * A note should enter the domain cleanly without needing an AI model, pipeline runner,
 * or source extraction sheet. This test suite verifies that `CreateNote` directly
 * constructs and persists a neutral `note` Item.
 *
 * ## Applied Design Pattern
 * - **Command / Use Case Pattern**: Encapsulates the note creation request in a single
 *   pure application service class (`CreateNote`).
 */
describe("CreateNote Use Case", () => {
  let cardRepo: MemoryCardRepository;
  let useCase: CreateNote;

  beforeEach(() => {
    cardRepo = new MemoryCardRepository();
    useCase = new CreateNote(cardRepo);
  });

  it("should create and persist a note item with trimmed content", async () => {
    const note = await useCase.execute({
      workspaceId: "ws-101",
      title: "Architectural Idea",
      content: "  ChunkBuddy should treat note capture as a first-class operation.  ",
    });

    expect(note.id).toBeDefined();
    expect(note.workspaceId).toBe("ws-101");
    expect(note.type).toBe("note");
    expect(note.title).toBe("Architectural Idea");
    expect(note.body).toBe("ChunkBuddy should treat note capture as a first-class operation.");

    const storedCards = await cardRepo.getCardsByWorkspace("ws-101");
    expect(storedCards).toHaveLength(1);
    expect(storedCards[0].id).toBe(note.id);
  });

  it("should auto-generate a title from content if title is omitted", async () => {
    const note = await useCase.execute({
      workspaceId: "ws-102",
      content: "First line of the note content.\nSecond line details.",
    });

    expect(note.type).toBe("note");
    expect(note.title).toBe("First line of the note content.");
    expect(note.body).toBe("First line of the note content.\nSecond line details.");
  });

  it("should assign parentId when creating a note inside a group", async () => {
    const note = await useCase.execute({
      workspaceId: "ws-103",
      parentId: "group-42",
      content: "Nested note idea",
    });

    expect(note.parentId).toBe("group-42");
  });
});
