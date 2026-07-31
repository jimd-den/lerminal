import { AgentGateway } from "../ports/gateways/AgentGateway";
import { BUILTIN_ASSISTANT_PROFILES } from "../../entities/assistantProfile";
import { WorkspaceMission } from "../../entities/workspace";
import { AgentRequestError, MissingApiKeyError } from "../errors";

const QUERY_STRATEGIST_PROFILE = BUILTIN_ASSISTANT_PROFILES.find(p => p.id === "builtin-query-strategist")!;

const MAX_QUERIES = 6;

export interface SuggestSearchQueriesRequest {
  topic: string;
  /** The workspace mission, when set — the model sees the goal, criteria, and phase, not just the raw topic. */
  mission?: WorkspaceMission;
  apiKey: string;
  model: string;
}

/** Serializes the mission into prompt context so suggested queries serve the actual goal. */
export function buildQueryStrategistPrompt(topic: string, mission?: WorkspaceMission): string {
  const lines: string[] = [`Topic: ${topic}`];
  if (mission) {
    lines.push(`Learner's goal: ${mission.goalTitle}`);
    if (mission.goalDescription) lines.push(`Why: ${mission.goalDescription}`);
    if (mission.targetDeliverable) lines.push(`Target deliverable: ${mission.targetDeliverable}`);
    if (mission.successCriteria.length > 0) {
      lines.push(`Success criteria: ${mission.successCriteria.join("; ")}`);
    }
    lines.push(`Current phase: ${mission.currentPhase}`);
  }
  return lines.join("\n");
}

/**
 * # Suggest Search Queries Interactor
 *
 * ## Business Value & Purpose
 * The optional, explicit "break this down for me" step ahead of "Research on the web":
 * calls the model once to turn one broad goal/topic into several sharper, more specific
 * search queries rather than making the user guess good query phrasing themselves. The
 * full workspace mission (goal, why, deliverable, success criteria, phase) is included in
 * the prompt when set, so queries serve the actual goal — not just the literal topic text.
 * This is a distinct, clearly-labeled AI call — never conflated with the actual web
 * search, which still only ever happens through `RunResearchInteractor`/`SearchGateway`.
 *
 * ## Return-shape enforcement
 * Requires a configured API key up front. The response rides the strict `cards-v1`
 * output contract (appended by the gateway), and this interactor validates the shape on
 * top: only non-empty string titles survive, duplicates are dropped case-insensitively,
 * the list is capped at {@link MAX_QUERIES}, and an empty/invalid result throws rather
 * than returning a fabricated success.
 */
export class SuggestSearchQueriesInteractor {
  constructor(private readonly agentGateway: AgentGateway) {}

  async execute(request: SuggestSearchQueriesRequest): Promise<string[]> {
    if (!request.apiKey?.trim()) {
      throw new MissingApiKeyError("Suggesting search queries");
    }

    const result = await this.agentGateway.ask(
      buildQueryStrategistPrompt(request.topic, request.mission),
      [],
      request.apiKey,
      request.model,
      QUERY_STRATEGIST_PROFILE.systemPrompt,
      "cards-v1"
    );

    // Template queries would be generic filler dressed as strategy — worse than none.
    if (result.isLocalFallback) {
      throw new AgentRequestError(
        result.fallbackReason ?? "No model answered, so no queries were suggested"
      );
    }
    const cards = result.cards;

    const seen = new Set<string>();
    const queries: string[] = [];
    for (const card of cards) {
      const title = typeof card?.title === "string" ? card.title.trim() : "";
      if (!title) continue;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      queries.push(title);
      if (queries.length >= MAX_QUERIES) break;
    }

    if (queries.length === 0) {
      throw new AgentRequestError("The model didn't return any usable query suggestions.");
    }
    return queries;
  }
}
