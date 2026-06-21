import { PipelineCommandDefinition } from "../../entities/commandDefinition";
import { PipelineCycleError } from "../errors";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";
import type { PipelineRunner } from "./PipelineRunner";

/**
 * # Pipeline Macro Command
 *
 * ## Business Value & Purpose
 * Turns a saved {@link PipelineCommandDefinition} into a first-class pipeline command:
 * running it expands and executes its `body` as a sub-pipeline. This is the core of
 * user-definable workflows — a learner can name a multi-stage routine (e.g.
 * `learn = ask "$1" | chunk | recall | space`) and reuse it anywhere a built-in command
 * is accepted.
 *
 * ## Recursion safety
 * The macro's own name is pushed onto `ctx.expansionStack` before sub-execution; if it
 * is already present, a {@link PipelineCycleError} is thrown rather than recursing
 * forever. The {@link PipelineRunner} is resolved lazily via a thunk so the macro always
 * uses the controller's current command set (which is rebuilt as commands change).
 */
export class PipelineMacroCommand implements PipelineCommand {
  readonly name: string;

  constructor(
    private readonly definition: PipelineCommandDefinition,
    private readonly getRunner: () => PipelineRunner
  ) {
    this.name = definition.name;
  }

  async execute(arg: string, ctx: CommandContext): Promise<CommandResult> {
    if (ctx.expansionStack.includes(this.name)) {
      throw new PipelineCycleError(this.name);
    }

    // Substitute the invocation argument into `$1` / `$ARG` placeholders so a macro
    // can take a topic. Quotes in the arg are stripped to avoid breaking the parser.
    const safeArg = arg.replace(/["']/g, "");
    const body = this.definition.body
      .replace(/\$1/g, safeArg)
      .replace(/\$ARG/g, safeArg);

    const outcome = await this.getRunner().run(body, {
      workspaceId: ctx.workspaceId,
      parentId: ctx.parentId,
      initialInputCards: ctx.inputCards,
      workspaces: ctx.workspaces,
      apiKey: ctx.apiKey,
      model: ctx.model,
      systemPrompt: ctx.systemPrompt,
      chunkSystemPrompt: ctx.chunkSystemPrompt,
      // The outer pipeline applies auto-grouping to the macro's output as a whole;
      // disable it inside so a macro doesn't double-wrap its own stages.
      autoGroup: false,
      expansionStack: [...ctx.expansionStack, this.name],
    });

    if (outcome.kind === "needsInput") {
      return { kind: "needsInput", mode: outcome.mode };
    }
    if (outcome.kind === "review") {
      return { kind: "review" };
    }
    return { kind: "cards", cards: outcome.cards };
  }
}
