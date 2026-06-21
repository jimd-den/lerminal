import { CardRepository } from "../../adapters/repositories/CardRepository";
import { Card, createCard } from "../../entities/card";
import { EmptySelectionError } from "../errors";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * `elaborate` — turns selected content cards into Feynman-style elaboration cards.
 * Elaboration (explaining a concept in your own words and connecting it to what you
 * already know) is a science-backed technique for durable understanding. The card
 * (`type: "question"`, `typeId: "elaboration"`) prompts the learner to explain the
 * topic; the source text is kept as the model answer to self-check against, and the
 * learner's own write-up is stored in the `explanation` field.
 */
export class ElaborateCommand implements PipelineCommand {
  readonly name = "elaborate";

  constructor(private readonly cardRepo: CardRepository) {}

  async execute(_arg: string, ctx: CommandContext): Promise<CommandResult> {
    const content = ctx.inputCards.filter(
      c => c.type === "chunk" || c.type === "source" || c.type === "note"
    );
    if (content.length === 0) {
      throw new EmptySelectionError("Select chunk, source or note to elaborate");
    }

    const cards: Card[] = content.map(card => {
      const topic = card.title.replace(/·.*$/, "").trim();
      return createCard({
        workspaceId: ctx.workspaceId,
        type: "question",
        typeId: "elaboration",
        title: `Explain in your own words: ${topic}`,
        body: "",
        answer: card.body, // The source content is the model answer to self-check against.
        fields: { explanation: "" },
        sourceRef: card.sourceRef || card.id,
        cite: card.cite,
        parentId: ctx.parentId ?? undefined,
      });
    });

    await this.cardRepo.saveCards(cards);
    return { kind: "cards", cards };
  }
}
