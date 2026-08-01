import { Card } from "../../entities/card";
import { isSchedulable } from "../../entities/cardTypeDefinition";
import { createInitialSchedule } from "../../entities/schedule";
import { CardRepository } from "../ports/repositories/CardRepository";
import { EmptySelectionError } from "../errors";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * # SpaceCommand (`space`)
 *
 * ## Business Value & Purpose
 * Enrolls selected study cards into FSRS spaced repetition scheduling by attaching an initial
 * schedule and persisting them. Notes and sources have learning behavior `none` and are
 * filtered out; only cards with learning behaviors (`flashcard`, `cloze`, `elaboration`, etc.)
 * are scheduled.
 *
 * ## Applied Design Patterns
 * - **Command Pattern**: Encapsulates study enrollment in a pipeline command stage.
 * - **Strategy / Registry Pattern**: Leverages `isSchedulable` to determine enrollment eligibility.
 */
export class SpaceCommand implements PipelineCommand {
  readonly name = "space";

  constructor(private readonly cardRepo: CardRepository) {}

  async execute(_arg: string, ctx: CommandContext): Promise<CommandResult> {

    const schedulableCards = ctx.inputCards.filter(card => isSchedulable(card, ctx.cardTypes));
    if (schedulableCards.length === 0) {
      throw new EmptySelectionError("No schedulable study cards (flashcard, cloze, elaboration) selected to enroll into spacing");
    }

    const now = Date.now();
    const cards: Card[] = schedulableCards.map(card => ({
      ...card,
      schedule: card.schedule || createInitialSchedule(now),
    }));

    for (const card of cards) {
      await this.cardRepo.saveCard(card);
    }


    return { kind: "cards", cards };
  }
}
