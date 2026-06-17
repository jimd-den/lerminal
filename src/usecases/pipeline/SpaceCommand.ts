import { Card } from "../../entities/card";
import { createInitialSchedule } from "../../entities/schedule";
import { CardRepository } from "../../adapters/repositories/CardRepository";
import { EmptySelectionError } from "../errors";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * `space` — enrolls selected question cards into the spaced-repetition schedule
 * by attaching an initial schedule and persisting them.
 */
export class SpaceCommand implements PipelineCommand {
  readonly name = "space";

  constructor(private readonly cardRepo: CardRepository) {}

  async execute(_arg: string, ctx: CommandContext): Promise<CommandResult> {
    const questions = ctx.inputCards.filter(c => c.type === "question");
    if (questions.length === 0) {
      throw new EmptySelectionError("Recall questions needed to schedule spacing");
    }

    const now = Date.now();
    const cards: Card[] = questions.map(card => ({
      ...card,
      schedule: createInitialSchedule(now),
    }));

    for (const card of cards) {
      await this.cardRepo.saveCard(card);
    }
    return { kind: "cards", cards };
  }
}
