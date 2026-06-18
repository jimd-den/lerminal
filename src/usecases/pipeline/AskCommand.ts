import { createCard } from "../../entities/card";
import { AgentGateway } from "../../adapters/gateways/AgentGateway";
import { CardRepository } from "../../adapters/repositories/CardRepository";
import { AgentRequestError } from "../errors";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * `ask "<query>"` — queries the agent for atomic cards, using the current input
 * cards as reading context, and persists the generated chunk cards.
 *
 * With no argument the command halts the pipeline and signals that user input is
 * required (the presenter opens the ask sheet).
 */
export class AskCommand implements PipelineCommand {
  readonly name = "ask";

  constructor(
    private readonly agentGateway: AgentGateway,
    private readonly cardRepo: CardRepository
  ) {}

  async execute(arg: string, ctx: CommandContext): Promise<CommandResult> {
    if (!arg) {
      return { kind: "needsInput", mode: "ask" };
    }

    let agentCards;
    try {
      agentCards = await this.agentGateway.ask(
        arg,
        ctx.inputCards,
        ctx.apiKey,
        ctx.model,
        ctx.systemPrompt
      );
    } catch (err: any) {
      throw new AgentRequestError(err?.message);
    }

    const cards = agentCards.map(item =>
      createCard({
        workspaceId: ctx.workspaceId,
        type: "chunk",
        title: item.title,
        body: item.body,
        cite: arg.substring(0, 16),
        parentId: ctx.parentId ?? undefined,
      })
    );

    if (cards.length === 0) {
      throw new AgentRequestError("The AI did not generate any cards from this prompt.");
    }

    await this.cardRepo.saveCards(cards);
    return { kind: "cards", cards };
  }
}
