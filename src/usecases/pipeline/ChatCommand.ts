import { CardRepository } from "../../adapters/repositories/CardRepository";
import { createCard } from "../../entities/card";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * `chat "<name>"` — creates a conversational chat card in the current group. Opening
 * the card lets the user talk directly to the agent, with the group's cards and the
 * workspace name supplied as context (and streamed responses). The conversation is
 * stored as a JSON message array in the card body.
 */
export class ChatCommand implements PipelineCommand {
  readonly name = "chat";

  constructor(private readonly cardRepo: CardRepository) {}

  async execute(arg: string, ctx: CommandContext): Promise<CommandResult> {
    if (!arg.trim()) {
      return { kind: "needsInput", mode: "ask" };
    }

    const card = createCard({
      workspaceId: ctx.workspaceId,
      type: "chat",
      typeId: "chat",
      title: arg.trim(),
      body: "[]", // empty conversation
      parentId: ctx.parentId ?? undefined,
    });

    await this.cardRepo.saveCard(card);
    return { kind: "cards", cards: [card] };
  }
}
