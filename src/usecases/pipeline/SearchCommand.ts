import { createCard } from "../../entities/card";
import { SearchGateway } from "../../adapters/gateways/SearchGateway";
import { CardRepository } from "../../adapters/repositories/CardRepository";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * `search "<query>"` — searches the internet using the configured SearchGateway
 * and outputs a "search" card containing the parsed results.
 */
export class SearchCommand implements PipelineCommand {
  readonly name = "search";

  constructor(
    private readonly searchGateway: SearchGateway,
    private readonly cardRepo: CardRepository
  ) {}

  async execute(arg: string, ctx: CommandContext): Promise<CommandResult> {
    if (!arg) {
      return { kind: "needsInput", mode: "ask" }; // Could have a distinct 'search' mode, but 'ask' opens input.
    }

    let results;
    try {
      results = await this.searchGateway.search(arg);
    } catch (err: any) {
      throw new Error("Search failed: " + err?.message);
    }

    if (!results || results.length === 0) {
      throw new Error("No results found for query.");
    }

    const card = createCard({
      workspaceId: ctx.workspaceId,
      type: "search",
      title: `Search: ${arg}`,
      body: JSON.stringify(results),
      parentId: ctx.parentId ?? undefined,
    });

    await this.cardRepo.saveCard(card);

    return {
      kind: "cards",
      cards: [card],
    };
  }
}
