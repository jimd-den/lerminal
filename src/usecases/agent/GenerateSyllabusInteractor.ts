import { AgentGateway } from "../ports/gateways/AgentGateway";
import { CardRepository } from "../ports/repositories/CardRepository";
import { BUILTIN_ASSISTANT_PROFILES, resolveProfileModel } from "../../entities/assistantProfile";
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
  /** Phase subgroups, in first-appearance order. Empty when the model gave no phase. */
  phases: Card[];
}

/** Splits a model-written "Phase Name :: Topic" title into its two parts, if present. */
function splitPhaseTitle(rawTitle: string): { phase: string | null; topic: string } {
  const separatorIndex = rawTitle.indexOf("::");
  if (separatorIndex === -1) return { phase: null, topic: rawTitle };
  const phase = rawTitle.slice(0, separatorIndex).trim();
  const topic = rawTitle.slice(separatorIndex + 2).trim();
  if (!phase || !topic) return { phase: null, topic: rawTitle };
  return { phase, topic };
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

    // Honors a model pinned onto the syllabus-planner persona; otherwise the caller's.
    const model = resolveProfileModel(SYLLABUS_PROFILE, request.model);

    const askResult = await this.agentGateway.ask(
      buildQueryStrategistPrompt(request.mission.goalTitle, request.mission),
      [],
      request.apiKey,
      model,
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
      provenance: createProvenance({ mode: "agent", model }),
    });

    // A model that names a phase ("Foundations :: Vector spaces") gets one subgroup per
    // distinct phase, created in the order it first appears; a model that doesn't parents
    // every item directly on the syllabus group, exactly as before phases existed.
    const phaseGroups = new Map<string, Card>();
    const phases: Card[] = [];
    const items: Card[] = [];

    for (const item of valid) {
      const { phase, topic } = splitPhaseTitle(item.title.trim());
      let parentId = group.id;

      if (phase) {
        let phaseGroup = phaseGroups.get(phase);
        if (!phaseGroup) {
          phaseGroup = createCard({
            workspaceId: request.workspaceId,
            type: "group",
            title: phase,
            body: "",
            parentId: group.id,
            provenance: createProvenance({ mode: "agent", model }),
          });
          phaseGroups.set(phase, phaseGroup);
          phases.push(phaseGroup);
        }
        parentId = phaseGroup.id;
      }

      items.push(
        createCard({
          workspaceId: request.workspaceId,
          type: "note",
          role: "concept",
          title: topic,
          body: item.body.trim(),
          parentId,
          provenance: createProvenance({ mode: "agent", model }),
        })
      );
    }

    await this.cardRepo.saveCards([group, ...phases, ...items]);
    return { group, items, phases };
  }
}
