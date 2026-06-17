import { GroupCardsInteractor } from "../grouping/GroupCardsInteractor";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * `group "<name>"` — bundles the selected cards under a new group created in the
 * current view, and outputs that group so it can itself be nested further (giving
 * infinite subgroups). Delegates to the shared {@link GroupCardsInteractor}.
 */
export class GroupCommand implements PipelineCommand {
  readonly name = "group";

  constructor(private readonly groupCards: GroupCardsInteractor) {}

  async execute(arg: string, ctx: CommandContext): Promise<CommandResult> {
    const group = await this.groupCards.execute({
      workspaceId: ctx.workspaceId,
      parentId: ctx.parentId,
      name: arg || "Group",
      cards: ctx.inputCards,
    });
    return { kind: "cards", cards: [group] };
  }
}
