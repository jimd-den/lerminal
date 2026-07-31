import { AppState } from "./LearnimalController";
import { AgentRunRequest, OperationPreset, buildAgentRunRequest, findOperationPreset } from "../../usecases/agent/operationPresets";
import { expandForPipe } from "../../entities/tree";

/**
 * # Agent Preflight Presenter
 *
 * ## Business Value & Purpose
 * Pure view-model layer answering the non-negotiable UX rule: before an AI/web action
 * runs, the UI must state what it will read, whether it will use the web, what it will
 * create, and where. `presentAgentPreflight` computes all of that (plus whether the run
 * is currently blocked, and why) from the same {@link AppState} + {@link OperationPreset}
 * that `LearnimalController.confirmPreflight` uses to actually dispatch — so the preview
 * the user sees and the request that runs are guaranteed to agree.
 */
export interface AgentPreflightModel {
  preset: OperationPreset;
  request: AgentRunRequest;
  selectedCount: number;
  /** Titles of the first few selected/context cards, for the "what will be read" preview. */
  contextPreview: string[];
  hasApiKey: boolean;
  modelLabel: string;
  webEnabled: boolean;
  /** Exact button copy, e.g. "Research 3 selected notes on the web". */
  runLabel: string;
  /** Null when the action can run; otherwise the reason it can't (shown instead of Run). */
  blockedReason: string | null;
  /** Non-blocking warning shown above Run (e.g. no API key configured — local fallback). */
  warning: string | null;
  /**
   * Deterministic, tappable search-query suggestions (only populated for presets that
   * require a typed query, i.e. research-web) — derived from the current selection, the
   * workspace mission, and uncovered gap-report success criteria. Never a model call.
   */
  querySuggestions: string[];
}

export function presentAgentPreflight(
  state: AppState,
  presetId: string,
  query: string
): AgentPreflightModel | null {
  const preset = findOperationPreset(presetId);
  if (!preset) return null;

  const selectedCards = expandForPipe(state.cards, state.selection);
  const request = buildAgentRunRequest({
    preset,
    workspaceId: state.activeWorkspaceId ?? "",
    parentId: state.currentGroupId,
    allCards: state.cards,
    selectedCards,
    query,
  });

  const hasApiKey = Boolean(state.openRouterKey?.trim());
  const webEnabled = request.webUsed;
  const needsAgent = preset.command === "ask";

  let blockedReason: string | null = null;
  if (preset.requiresSelection && selectedCards.length === 0) {
    blockedReason = "Select at least one card first";
  } else if (preset.requiresQuery && !query.trim()) {
    blockedReason = "Enter a search query";
  } else if (!state.activeWorkspaceId) {
    blockedReason = "Create a workspace first";
  }

  const warning =
    !blockedReason && needsAgent && !hasApiKey
      ? "No OpenRouter API key configured — this will fall back to local template cards, not a real model response."
      : null;

  const previewCards = request.contextCardIds
    .map(id => state.cards.find(c => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const runLabel = buildRunLabel(preset, selectedCards.length, query);
  const querySuggestions = preset.requiresQuery
    ? buildQuerySuggestions(state, selectedCards)
    : [];

  return {
    preset,
    request,
    selectedCount: selectedCards.length,
    contextPreview: previewCards.slice(0, 5).map(c => c.title),
    hasApiKey,
    modelLabel: state.selectedModel?.trim() || "default model",
    webEnabled,
    runLabel,
    blockedReason,
    warning,
    querySuggestions,
  };
}

/**
 * Deterministic search-query candidates: selected card titles first (the most specific
 * signal), then uncovered gap-report success criteria, then the workspace mission title
 * as a last resort — deduped and capped so the preflight stays a quick tap, not a wall
 * of options.
 */
function buildQuerySuggestions(
  state: AppState,
  selectedCards: { title: string }[]
): string[] {
  const suggestions: string[] = [];
  const seen = new Set<string>();
  const push = (text?: string | null) => {
    const trimmed = text?.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push(trimmed);
  };

  for (const card of selectedCards.slice(0, 2)) push(card.title);

  const uncovered = state.gapReport?.successCriteria.filter(c => !c.hasEvidence) ?? [];
  for (const criterion of uncovered.slice(0, 2)) push(criterion.text);

  if (state.gapReport?.hasMission) push(state.gapReport.missionTitle);

  return suggestions.slice(0, 4);
}

function buildRunLabel(preset: OperationPreset, selectedCount: number, query: string): string {
  if (preset.id === "research-web") {
    const q = query.trim();
    return q ? `Research "${q}" on the web` : "Research on the web";
  }
  if (preset.requiresSelection) {
    return `${preset.label} (${selectedCount} selected)`;
  }
  return preset.label;
}
