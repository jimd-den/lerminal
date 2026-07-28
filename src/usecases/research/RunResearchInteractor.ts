import { SearchGateway } from "../../adapters/gateways/SearchGateway";
import { normalizeSearchResults, ResearchResult } from "../../entities/research";
import { ResearchNoResultsError } from "../errors";

/**
 * # Run Research Interactor
 *
 * ## Business Value & Purpose
 * The orchestration step behind the "Research on the web" action: performs an *actual*
 * search via {@link SearchGateway} (never asks the model to pretend it searched) and
 * normalizes the raw hits into inspectable {@link ResearchResult} candidates. Throws a
 * clear, honest error when nothing came back — `SearchGateway` implementations return an
 * empty array for both network failure and a true empty result set, so this interactor
 * can't distinguish the two further without changing that contract; it reports the
 * situation plainly rather than pretending either one succeeded.
 */
export class RunResearchInteractor {
  constructor(private readonly searchGateway: SearchGateway) {}

  async execute(query: string, now: number = Date.now()): Promise<ResearchResult[]> {
    const trimmed = query.trim();
    let raw;
    try {
      raw = await this.searchGateway.search(trimmed);
    } catch (err: any) {
      throw new ResearchNoResultsError(trimmed);
    }

    if (!raw || raw.length === 0) {
      throw new ResearchNoResultsError(trimmed);
    }

    return normalizeSearchResults(raw, trimmed, now);
  }
}
