import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * `review` — halts the pipeline and signals the presenter to open the spaced
 * repetition review session. The review queue itself is built by
 * {@link StartReviewInteractor}.
 */
export class ReviewCommand implements PipelineCommand {
  readonly name = "review";

  async execute(_arg: string, _ctx: CommandContext): Promise<CommandResult> {
    return { kind: "review" };
  }
}
