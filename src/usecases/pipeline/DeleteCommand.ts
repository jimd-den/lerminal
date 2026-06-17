import { CardRepository } from "../../adapters/repositories/CardRepository";
import { EmptySelectionError } from "../errors";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * `delete` — permanently removes the selected cards. Because a selected group is
 * expanded to its whole subtree before piping, deleting a group removes the group
 * and everything nested under it. Produces no downstream cards.
 */
export class DeleteCommand implements PipelineCommand {
  readonly name = "delete";

  constructor(private readonly cardRepo: CardRepository) {}

  async execute(_arg: string, ctx: CommandContext): Promise<CommandResult> {
    if (ctx.inputCards.length === 0) {
      throw new EmptySelectionError("Select cards to delete");
    }
    for (const card of ctx.inputCards) {
      await this.cardRepo.deleteCard(card.id);
    }
    return { kind: "noop" };
  }
}
