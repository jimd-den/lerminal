import { CreateNote } from "../card/CreateNote";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * # NoteCommand (`note "text"`)
 *
 * ## Business Value & Purpose
 * Provides a fast pipeline stage for creating plain text notes without AI processing or URL fetching.
 * Delegates directly to the `CreateNote` application use case to guarantee zero-friction capture.
 *
 * ## Applied Design Patterns
 * - **Command Pattern**: Implements `PipelineCommand` interface to be invokable within pipeline strings.
 * - **Adapter / Facade Pattern**: Wraps `CreateNote` use case for the pipeline runner.
 */
export class NoteCommand implements PipelineCommand {
  readonly name = "note";

  constructor(private readonly createNoteUseCase: CreateNote) {}

  async execute(arg: string, ctx: CommandContext): Promise<CommandResult> {

    if (!arg || !arg.trim()) {
      return { kind: "needsInput", mode: "source" };
    }

    const noteCard = await this.createNoteUseCase.execute({
      workspaceId: ctx.workspaceId,
      parentId: ctx.parentId ?? undefined,
      content: arg,
    });


    return { kind: "cards", cards: [noteCard] };
  }
}
