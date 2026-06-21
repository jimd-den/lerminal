import { createCard } from "../../entities/card";
import { SearchGateway } from "../../adapters/gateways/SearchGateway";
import { CardRepository } from "../../adapters/repositories/CardRepository";
import { SettingsRepository } from "../../adapters/repositories/SettingsRepository";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * `search "<query>"` — searches the internet using the configured SearchGateway
 * and outputs a "search" card containing the parsed results.
 */
export class SearchCommand implements PipelineCommand {
  readonly name = "search";

  constructor(
    private readonly searchGateway: SearchGateway,
    private readonly cardRepo: CardRepository,
    private readonly settingsRepo: SettingsRepository
  ) {}

  async execute(rawArg: string, ctx: CommandContext): Promise<CommandResult> {
    if (!rawArg) {
      return { kind: "needsInput", mode: "ask" }; // Could have a distinct 'search' mode, but 'ask' opens input.
    }

    let query = rawArg;
    const sites: string[] = [];

    // Load custom preset flags
    const settings = await this.settingsRepo.getSettings();
    const siteFlags = settings?.searchSiteFlags || { "wiki": "wikipedia.org", "nature": "nature.com" };

    // Process custom preset flags (e.g. --wiki)
    for (const [flag, domain] of Object.entries(siteFlags)) {
      const regex = new RegExp(`--${flag}\\b`, "g");
      if (regex.test(query)) {
        sites.push(domain);
        query = query.replace(regex, "");
      }
    }

    // Simple parser for --site or -s
    const siteRegex = /(?:--site|-s)\s+([^\s]+)/g;
    let match;
    while ((match = siteRegex.exec(query)) !== null) {
      sites.push(match[1]);
    }
    
    // Remove the generic flags from the query
    query = query.replace(/(?:--site|-s)\s+[^\s]+/g, "").trim();

    if (sites.length > 0) {
      if (sites.length === 1) {
        query = `${query} site:${sites[0]}`;
      } else {
        const siteQuery = sites.map(s => `site:${s}`).join(" OR ");
        query = `${query} (${siteQuery})`;
      }
    }

    let results;
    try {
      results = await this.searchGateway.search(query);
    } catch (err: any) {
      throw new Error("Search failed: " + err?.message);
    }

    if (!results || results.length === 0) {
      throw new Error("No results found for query.");
    }

    const card = createCard({
      workspaceId: ctx.workspaceId,
      type: "search",
      title: `Search: ${rawArg}`,
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
