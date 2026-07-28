import { AgentGateway } from "../../adapters/gateways/AgentGateway";
import { BUILTIN_ASSISTANT_PROFILES } from "../../entities/assistantProfile";
import { AgentRequestError, MissingApiKeyError } from "../errors";

const QUERY_STRATEGIST_PROFILE = BUILTIN_ASSISTANT_PROFILES.find(p => p.id === "builtin-query-strategist")!;

export interface SuggestSearchQueriesRequest {
  topic: string;
  apiKey: string;
  model: string;
}

/**
 * # Suggest Search Queries Interactor
 *
 * ## Business Value & Purpose
 * The optional, explicit "break this down for me" step ahead of "Research on the web":
 * calls the model once to turn one broad goal/topic into several sharper, more specific
 * search queries (official docs, comparisons, tutorials, pitfalls) rather than making the
 * user guess good query phrasing themselves. This is a distinct, clearly-labeled AI call —
 * never conflated with the actual web search, which still only ever happens through
 * `RunResearchInteractor`/`SearchGateway`.
 *
 * Requires a configured API key up front, same honesty guard as the other agent-backed
 * research steps. Note: unlike `CreateResearchBriefInteractor`, there is no structural
 * signal here (like a missing citation) to detect a gateway's local-fallback path — see
 * the Phase 0 recon doc on `OpenRouterAgentGateway`'s silent fallback. Until that's fixed
 * at the gateway (Phase 8), a fallback response would surface as plausible-looking but
 * generic query text rather than being caught here.
 */
export class SuggestSearchQueriesInteractor {
  constructor(private readonly agentGateway: AgentGateway) {}

  async execute(request: SuggestSearchQueriesRequest): Promise<string[]> {
    if (!request.apiKey?.trim()) {
      throw new MissingApiKeyError("Suggesting search queries");
    }

    const cards = await this.agentGateway.ask(
      request.topic,
      [],
      request.apiKey,
      request.model,
      QUERY_STRATEGIST_PROFILE.systemPrompt,
      "cards-v1"
    );

    const queries = cards.map(c => c.title.trim()).filter(Boolean);
    if (queries.length === 0) {
      throw new AgentRequestError("The model didn't return any query suggestions.");
    }
    return queries;
  }
}
