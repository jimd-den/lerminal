import { CardRepository } from "../ports/repositories/CardRepository";
import { Card, createCard } from "../../entities/card";
import { makeCloze } from "../../entities/cloze";
import { EmptySelectionError } from "../errors";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * # ClozeCommand (`cloze`)
 *
 * ## Business Value & Purpose
 * Turns selected content cards (chunk/source/note) into interactive fill-in-the-blank
 * cards with inline deletion placeholders (`{{c1}}`, `{{c2}}`) for retrieval practice.
 * Stores structured template and blanks in `card.fields` so the review engine can render
 * inline text inputs, evaluate individual blanks, and provide granular feedback.
 *
 * ## Applied Design Patterns
 * - **Command Pattern**: Encapsulates fill-in-the-blank card creation in a pipeline stage.
 */
export class ClozeCommand implements PipelineCommand {
  readonly name = "cloze";

  constructor(private readonly cardRepo: CardRepository) {}

  async execute(_arg: string, ctx: CommandContext): Promise<CommandResult> {
    const content = ctx.inputCards.filter(
      c => c.type === "chunk" || c.type === "source" || c.type === "note"
    );
    if (content.length === 0) {
      throw new EmptySelectionError("Select chunk, source or note to cloze");
    }

    const cards: Card[] = [];
    for (const card of content) {
      const cloze = makeCloze(card.body || card.title);
      if (!cloze) continue;
      cards.push(createCard({
        workspaceId: ctx.workspaceId,
        type: "question",
        typeId: "cloze",
        title: card.title,
        body: "",
        answer: cloze.fullAnswer,
        fields: {
          template: cloze.template,
          blanks: JSON.stringify(cloze.blanks),
        },
        sourceRef: card.sourceRef || card.id,
        cite: card.cite,
        parentId: ctx.parentId ?? undefined,
      }));
    }

    if (cards.length === 0) {
      throw new EmptySelectionError("Not enough text to build cloze cards");
    }

    await this.cardRepo.saveCards(cards);
    return { kind: "cards", cards };
  }
}
