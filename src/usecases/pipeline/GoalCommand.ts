import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * `goal` — halts the pipeline and signals the presenter to open the Goal Architect.
 *
 * Like `review`, this is a session command rather than a transform: it produces no cards
 * and consumes no selection, so it ends the pipeline instead of passing anything on. The
 * mission cards it eventually leads to are created by an explicit acceptance inside the
 * sheet, never as a side effect of running this.
 */
export class GoalCommand implements PipelineCommand {
  readonly name = "goal";

  async execute(_arg: string, _ctx: CommandContext): Promise<CommandResult> {
    return { kind: "goal" };
  }
}
