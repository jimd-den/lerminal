import { CardRepository } from "../../adapters/repositories/CardRepository";
import { AgentGateway } from "../../adapters/gateways/AgentGateway";
import { createCard } from "../../entities/card";
import { chunkCard } from "../commands";
import { EmptySelectionError, AgentRequestError } from "../errors";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * `chunk` — splits selected source/note/chunk cards into atomic, screen-sized
 * chunk cards via the LLM (or local heuristic fallback) and persists them.
 */
export class ChunkCommand implements PipelineCommand {
  readonly name = "chunk";

  constructor(
    private readonly agentGateway: AgentGateway,
    private readonly cardRepo: CardRepository
  ) {}

  async execute(_arg: string, ctx: CommandContext): Promise<CommandResult> {
    const chunkable = ctx.inputCards.filter(
      c => c.type === "source" || c.type === "note" || c.type === "chunk"
    );
    if (chunkable.length === 0) {
      throw new EmptySelectionError("Select source or note to chunk");
    }

    const cards = [];

    for (const card of chunkable) {
      if (!ctx.apiKey?.trim()) {
        // Fall back to local heuristic chunking if no API key is provided
        const generated = chunkCard(card).map(c => ({
          ...c,
          parentId: ctx.parentId ?? undefined
        }));
        cards.push(...generated);
        continue;
      }

      let agentCards;
      try {
        agentCards = await this.agentGateway.ask(
          "Extract atomic ideas from the provided context.",
          [card],
          ctx.apiKey,
          ctx.model,
          ctx.chunkSystemPrompt
        );
      } catch (err: any) {
        throw new AgentRequestError(err?.message);
      }

      const generated = agentCards.map(item => createCard({
        workspaceId: ctx.workspaceId,
        type: "chunk",
        title: item.title,
        body: item.body,
        sourceRef: card.sourceRef || card.id,
        cite: card.cite,
        parentId: ctx.parentId ?? undefined,
      }));
      cards.push(...generated);
    }

    if (cards.length === 0) {
      throw new AgentRequestError("The AI did not generate any chunks from the source.");
    }

    await this.cardRepo.saveCards(cards);
    return { kind: "cards", cards };
  }
}
