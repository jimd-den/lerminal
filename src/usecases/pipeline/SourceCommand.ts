import { createCard } from "../../entities/card";
import { CardRepository } from "../../adapters/repositories/CardRepository";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * `source <url|text>` — captures raw reading material as a single source card.
 *
 * With no argument the command halts the pipeline and signals that user input is
 * required (the presenter opens the source sheet).
 */
export class SourceCommand implements PipelineCommand {
  readonly name = "source";

  constructor(private readonly cardRepo: CardRepository) {}

  async execute(arg: string, ctx: CommandContext): Promise<CommandResult> {
    if (!arg) {
      return { kind: "needsInput", mode: "source" };
    }

    const isUrl = /^https?:\/\//i.test(arg);
    const title = isUrl
      ? arg.replace(/^https?:\/\//, "").substring(0, 40)
      : arg.substring(0, 40);

    const sourceCard = createCard({
      workspaceId: ctx.workspaceId,
      type: "source",
      title,
      body: arg,
      cite: "user source",
    });

    await this.cardRepo.saveCard(sourceCard);
    return { kind: "cards", cards: [sourceCard] };
  }
}
