import { CardRepository } from "../../adapters/repositories/CardRepository";
import { Card, createCard } from "../../entities/card";
import { makeCloze } from "../commands";
import { EmptySelectionError } from "../errors";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * `cloze` — turns selected content cards (chunk/source/note) into fill-in-the-blank
 * cards for retrieval practice. Deterministic and offline: it blanks the passage's
 * salient terms (proper nouns, numbers, long words). The result is a reviewable card
 * (`type: "question"`, `typeId: "cloze"`) whose title is the blanked prompt and whose
 * answer lists the removed terms, so it slots straight into the spaced-repetition flow.
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
        title: cloze.prompt,
        body: "",
        answer: cloze.answer,
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
