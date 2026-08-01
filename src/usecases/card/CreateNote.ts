import { Card, createCard } from "../../entities/card";
import { CardRepository } from "../ports/repositories/CardRepository";

/**
 * Request payload for creating a note.
 */
export interface CreateNoteRequest {
  workspaceId: string;
  parentId?: string;
  title?: string;
  content: string;
}

/**
 * # CreateNote Application Use Case
 *
 * ## Business Value & Rationale
 * In ChunkBuddy, capturing a thought is the most privileged and fundamental path.
 * A note should enter the domain cleanly without undergoing AI processing, macro expansion,
 * or extraction pipeline overhead. `CreateNote` provides a direct, zero-friction use case
 * that persists a user's text as a neutral `note` item entity.
 *
 * ## Applied Design Pattern
 * - **Command / Use Case Pattern**: Encapsulates the note creation execution into a single,
 *   composable pure application service.
 * - **Dependency Inversion Principle (SOLID)**: Relies on the abstract `CardRepository` port,
 *   keeping application logic completely decoupled from storage implementations.
 */
export class CreateNote {
  constructor(private readonly cardRepo: CardRepository) {}

  /**
   * Executes the creation of a note item.
   *
   * @param request Input containing workspaceId, optional parentId, title, and content.
   * @returns The newly created and persisted Card entity of type 'note'.
   */
  async execute(request: CreateNoteRequest): Promise<Card> {
    const trimmedContent = request.content.trim();

    // Determine the title: use explicit title if provided; otherwise derive from the first line of content
    const derivedTitle = request.title?.trim()
      ? request.title.trim()
      : trimmedContent.split("\n")[0]?.substring(0, 50) || "Untitled Note";

    const note = createCard({
      workspaceId: request.workspaceId,
      parentId: request.parentId,
      type: "note",
      title: derivedTitle,
      body: trimmedContent,
    });

    await this.cardRepo.saveCard(note);


    return note;
  }
}
