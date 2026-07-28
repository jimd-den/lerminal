import { AppState } from "./LearnimalController";
import { AgentRunRequest, OperationPreset, buildAgentRunRequest, findOperationPreset } from "../../usecases/agent/operationPresets";
import { expandForPipe } from "../../usecases/tree";

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
  };
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
