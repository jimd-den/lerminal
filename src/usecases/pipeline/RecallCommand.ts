import { CardRepository } from "../../adapters/repositories/CardRepository";
import { recallCard } from "../commands";
import { EmptySelectionError } from "../errors";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * `recall` — converts selected source/note/chunk cards into active-recall
 * question cards and persists them.
 */
export class RecallCommand implements PipelineCommand {
  readonly name = "recall";

  constructor(private readonly cardRepo: CardRepository) {}

  async execute(_arg: string, ctx: CommandContext): Promise<CommandResult> {
    const recallable = ctx.inputCards.filter(
      c => c.type === "chunk" || c.type === "source" || c.type === "note"
    );
    if (recallable.length === 0) {
      throw new EmptySelectionError("Select source, note or chunk to recall");
    }

    const cards = recallable.map(card => recallCard(card));
    await this.cardRepo.saveCards(cards);
    return { kind: "cards", cards };
  }
}
