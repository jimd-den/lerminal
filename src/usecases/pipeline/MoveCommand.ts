import { CardRepository } from "../../adapters/repositories/CardRepository";
import { MissingArgumentError, WorkspaceNotFoundError } from "../errors";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * `move <workspace>` — reassigns selected cards to another workspace, resolved by
 * id or (case-insensitive) name. Produces no downstream cards: the moved cards
 * leave the active workspace, so the selection is cleared.
 */
export class MoveCommand implements PipelineCommand {
  readonly name = "move";

  constructor(private readonly cardRepo: CardRepository) {}

  async execute(arg: string, ctx: CommandContext): Promise<CommandResult> {
    if (!arg) {
      throw new MissingArgumentError("Provide a workspace name or ID to move cards to");
    }

    const target = ctx.workspaces.find(
      w => w.id === arg || w.name.toLowerCase() === arg.toLowerCase()
    );
    if (!target) {
      throw new WorkspaceNotFoundError();
    }

    for (const card of ctx.inputCards) {
      await this.cardRepo.saveCard({ ...card, workspaceId: target.id });
    }
    return { kind: "noop" };
  }
}
