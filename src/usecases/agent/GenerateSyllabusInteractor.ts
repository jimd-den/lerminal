import { AgentGateway } from "../../adapters/gateways/AgentGateway";
import { CardRepository } from "../../adapters/repositories/CardRepository";
import { BUILTIN_ASSISTANT_PROFILES } from "../../entities/assistantProfile";
import { Card, createCard } from "../../entities/card";
import { createProvenance } from "../../entities/provenance";
import { WorkspaceMission } from "../../entities/workspace";
import { AgentRequestError, MissingApiKeyError } from "../errors";
import { buildQueryStrategistPrompt } from "./SuggestSearchQueriesInteractor";

const SYLLABUS_PROFILE = BUILTIN_ASSISTANT_PROFILES.find(p => p.id === "builtin-syllabus-planner")!;

export interface GenerateSyllabusRequest {
  mission: WorkspaceMission;
  workspaceId: string;
  apiKey: string;
  model: string;
}

export interface GeneratedSyllabus {
  /** The group card containing the syllabus. */
  group: Card;
  /** Ordered prerequisite cards, each title a searchable topic name. */
  items: Card[];
}

/**
 * # Generate Syllabus Interactor
 *
 * ## Business Value & Purpose
 * Turns a workspace mission into a persisted mini-syllabus of ordered prerequisites: one
 * explicit model call (full mission context in the prompt, `cards-v1` contract enforced
 * plus shape validation here) producing `concept`-role cards under a "Syllabus" group.
 * Each item's title is a searchable topic name, so the research preflight's deterministic
 * suggestions pick syllabus items up directly once selected — capture leads to search.
 * Requires a configured API key up front; an empty/invalid response throws rather than
 * saving a fabricated syllabus.
 */
export class GenerateSyllabusInteractor {
  constructor(
    private readonly agentGateway: AgentGateway,
    private readonly cardRepo: CardRepository
  ) {}

  async execute(request: GenerateSyllabusRequest): Promise<GeneratedSyllabus> {
    if (!request.apiKey?.trim()) {
      throw new MissingApiKeyError("Generating a syllabus");
    }

    const askResult = await this.agentGateway.ask(
      buildQueryStrategistPrompt(request.mission.goalTitle, request.mission),
      [],
      request.apiKey,
      request.model,
      SYLLABUS_PROFILE.systemPrompt,
      "cards-v1"
    );

    // A syllabus of template prerequisites would be confidently wrong about the goal.
    if (askResult.isLocalFallback) {
      throw new AgentRequestError(
        askResult.fallbackReason ?? "No model answered, so no syllabus was generated"
      );
    }
    const responses = askResult.cards;

    const valid = responses.filter(
      r => typeof r?.title === "string" && r.title.trim() && typeof r?.body === "string"
    );
    if (valid.length === 0) {
      throw new AgentRequestError("The model didn't return a usable syllabus.");
    }

    const group = createCard({
      workspaceId: request.workspaceId,
      type: "group",
      title: `Syllabus: ${request.mission.goalTitle}`,
      body: "",
      provenance: createProvenance({ mode: "agent", model: request.model }),
    });

    const items = valid.map(item =>
      createCard({
        workspaceId: request.workspaceId,
        type: "note",
        role: "concept",
        title: item.title.trim(),
        body: item.body.trim(),
        parentId: group.id,
        provenance: createProvenance({ mode: "agent", model: request.model }),
      })
    );

    await this.cardRepo.saveCards([group, ...items]);
    return { group, items };
  }
}
