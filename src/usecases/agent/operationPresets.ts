import { Card } from "../../entities/card";
import { AgentScopeKind, ScopeBudget, resolveScopedContext } from "./AgentScope";

/**
 * # Operation Presets & Agent Run Requests
 *
 * ## Business Value & Purpose
 * Replaces ambiguous generic AI entry points with named, explicit actions. Each
 * {@link OperationPreset} is a fixed, reviewable declaration of what a user-facing action
 * reads, whether it touches the web, and what it dispatches to underneath — reusing the
 * existing pipeline commands (`ask`, `search`, `recall`) rather than inventing a parallel
 * execution path. {@link buildAgentRunRequest} turns a preset + current app state into a
 * deterministic, testable {@link AgentRunRequest} *before* anything reaches a gateway —
 * that request object is exactly what the preflight UI renders and the run receipt records.
 */

/**
 * Which existing pipeline command (or, for `research`, the dedicated research flow —
 * see `RunResearchInteractor`/`LearnimalController.startResearch`) a preset dispatches to.
 */
export type PresetCommand = "ask" | "search" | "recall" | "research";

export interface OperationPreset {
  id: string;
  label: string;
  /** One-line plain-English purpose shown in the preflight. */
  purpose: string;
  defaultScope: AgentScopeKind;
  requiresSelection: boolean;
  requiresQuery: boolean;
  /** Instruction substituted when the preset doesn't require the user to type a query. */
  defaultQuery?: string;
  command: PresetCommand;
  /** Assistant profile id/name to pass as `ask --profile <id>`, for `command: "ask"` presets. */
  profileId?: string;
  /** Plain-English description of what will be created, shown in the preflight. */
  outputDescription: string;
}

export const OPERATION_PRESETS: OperationPreset[] = [
  {
    id: "explain-selected",
    label: "Explain selected notes",
    purpose: "Explain the selected notes using only what's selected — no web, no rest of workspace.",
    defaultScope: "selected-only",
    requiresSelection: true,
    requiresQuery: false,
    defaultQuery: "Explain the selected material clearly, grounded strictly in what's provided.",
    command: "ask",
    profileId: "builtin-generate-cards",
    outputDescription: "One or more grounded explanation cards",
  },
  {
    id: "research-web",
    label: "Research on the web",
    purpose: "Search the web for your query and return inspectable source candidates.",
    defaultScope: "web",
    requiresSelection: false,
    requiresQuery: true,
    command: "research",
    outputDescription: "Inspectable source candidates — keep/reject/extract, then optionally create a cited brief",
  },
  {
    id: "find-prerequisites",
    label: "Find prerequisites",
    purpose: "Identify what you need to know before tackling this material or mission.",
    defaultScope: "workspace",
    requiresSelection: false,
    requiresQuery: false,
    defaultQuery: "Identify the prerequisite concepts or gaps for this material.",
    command: "ask",
    profileId: "builtin-prerequisite-finder",
    outputDescription: "Prerequisite concept/question cards, or a gap assessment",
  },
  {
    id: "plan-experiment",
    label: "Plan experiment",
    purpose: "Turn the selected notes or questions into a concrete, testable experiment plan.",
    defaultScope: "selected-only",
    requiresSelection: true,
    requiresQuery: false,
    defaultQuery: "Plan one concrete experiment based on the selected material.",
    command: "ask",
    profileId: "builtin-experiment-planner",
    outputDescription: "One experiment card: hypothesis, method, materials, measurement, next action",
  },
  {
    id: "make-study-cards",
    label: "Make study cards",
    purpose: "Turn selected content into active-recall questions. Scheduling is a separate step.",
    defaultScope: "selected-only",
    requiresSelection: true,
    requiresQuery: false,
    command: "recall",
    outputDescription: "Recall question cards (not yet enrolled in spaced repetition)",
  },
  {
    id: "plan-capstone",
    label: "Plan capstone",
    purpose: "Turn the workspace mission and current material into milestones and tasks.",
    defaultScope: "workspace",
    requiresSelection: false,
    requiresQuery: false,
    defaultQuery: "Plan capstone milestones and next tasks from the workspace mission and current material.",
    command: "ask",
    profileId: "builtin-capstone-planner",
    outputDescription: "Milestone/task/deliverable cards",
  },
];

export function findOperationPreset(id: string): OperationPreset | undefined {
  return OPERATION_PRESETS.find(p => p.id === id);
}

/** The deterministic, testable request object every AI action produces before dispatch. */
export interface AgentRunRequest {
  presetId: string;
  actionLabel: string;
  scope: AgentScopeKind;
  webUsed: boolean;
  workspaceId: string;
  parentId: string | null;
  destinationLabel: string;
  selectedCardIds: string[];
  contextCardIds: string[];
  contextTruncated: boolean;
  contextConsideredCount: number;
  query?: string;
  outputDescription: string;
}

export interface BuildAgentRunRequestParams {
  preset: OperationPreset;
  workspaceId: string;
  parentId: string | null;
  allCards: Card[];
  selectedCards: Card[];
  query?: string;
  budget?: ScopeBudget;
}

export function buildAgentRunRequest(params: BuildAgentRunRequestParams): AgentRunRequest {
  const { preset } = params;
  const context = resolveScopedContext({
    scope: preset.defaultScope,
    allCards: params.allCards,
    selectedCards: params.selectedCards,
    parentId: params.parentId,
    budget: params.budget,
  });

  const destinationCard = params.parentId
    ? params.allCards.find(c => c.id === params.parentId)
    : undefined;

  return {
    presetId: preset.id,
    actionLabel: preset.label,
    scope: preset.defaultScope,
    webUsed: preset.defaultScope === "web" || preset.defaultScope === "selected-plus-web",
    workspaceId: params.workspaceId,
    parentId: params.parentId,
    destinationLabel: destinationCard ? destinationCard.title : "Workspace root",
    selectedCardIds: params.selectedCards.map(c => c.id),
    contextCardIds: context.cards.map(c => c.id),
    contextTruncated: context.truncated,
    contextConsideredCount: context.totalConsideredCount,
    query: params.query?.trim() || undefined,
    outputDescription: preset.outputDescription,
  };
}

/** Escapes a value for embedding as a double-quoted pipeline argument. */
function escapePipelineArg(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Turns a preset + resolved query into the literal pipeline text `runPipeline` executes,
 * reusing the existing `ask`/`search`/`recall` commands rather than a parallel code path.
 */
export function buildPipelineText(preset: OperationPreset, query?: string): string {
  const resolvedQuery = (query?.trim() || preset.defaultQuery || "").trim();
  switch (preset.command) {
    case "ask": {
      const profile = preset.profileId ? `--profile ${preset.profileId} ` : "";
      return `ask ${profile}"${escapePipelineArg(resolvedQuery)}"`;
    }
    case "search":
      return `search "${escapePipelineArg(resolvedQuery)}"`;
    case "recall":
      return "recall";
    case "research":
      throw new Error("research-flow presets dispatch via LearnimalController.startResearch, not a pipeline string");
  }
}
