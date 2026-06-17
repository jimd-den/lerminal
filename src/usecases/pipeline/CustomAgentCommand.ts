import { createCard } from "../../entities/card";
import { AgentCommandDefinition } from "../../entities/commandDefinition";
import { AgentGateway } from "../../adapters/gateways/AgentGateway";
import { CardRepository } from "../../adapters/repositories/CardRepository";
import { AgentRequestError } from "../errors";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * A user-defined agent command: behaves like `ask`, but runs the agent with the
 * definition's own system prompt instead of the global one. Its pipeline keyword
 * is the definition's name, so it composes with every other command.
 *
 * With no argument it halts for input (like `ask`); the runner reports this
 * command's name so the input sheet re-dispatches to it rather than to `ask`.
 */
export class CustomAgentCommand implements PipelineCommand {
  readonly name: string;

  constructor(
    private readonly definition: AgentCommandDefinition,
    private readonly agentGateway: AgentGateway,
    private readonly cardRepo: CardRepository
  ) {
    this.name = definition.name;
  }

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
        this.definition.systemPrompt
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

    await this.cardRepo.saveCards(cards);
    return { kind: "cards", cards };
  }
}
