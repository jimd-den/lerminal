import { Workspace } from "../../entities/workspace";
import {
  WorkspaceAgentMessage,
  WorkspaceAgentProposalViewState,
  WorkspaceAgentState,
} from "../../usecases/workspaceAgent/WorkspaceAgentWorkflow";
import { WorkspacePulseObservation } from "../../usecases/workspaceAgent/observeWorkspace";

/**
 * # Workspace Agent Presenter
 *
 * ## Business Value & Purpose
 * Pure projection from the workflow's session state and `observeWorkspace`'s output into
 * exactly what the pulse banner and conversation sheet render. No side effects, no
 * gateway access — this file cannot itself make anything look like AI or web activity
 * happened, because it never runs anything, it only describes state that already exists.
 */

/** Up to three short actions offered beside the pulse text. */
export interface WorkspacePulseChip {
  id: string;
  label: string;
}

export interface WorkspacePulseViewModel {
  message: string;
  chips: WorkspacePulseChip[];
  cardIds: string[];
}

const CHIPS_BY_KIND: Record<WorkspacePulseObservation["kind"], WorkspacePulseChip[]> = {
  "notes-need-question": [
    { id: "group-these", label: "Group these" },
    { id: "dismiss", label: "Dismiss" },
  ],
  "unextracted-source": [
    { id: "extract-source", label: "Extract source" },
    { id: "dismiss", label: "Dismiss" },
  ],
  "unlinked-note-cluster": [
    { id: "group-these", label: "Group these" },
    { id: "find-sources", label: "Find sources" },
    { id: "dismiss", label: "Dismiss" },
  ],
};

/** Projects a raw observation (or none) into the pulse banner's view model. */
export function presentWorkspacePulse(
  observation: WorkspacePulseObservation | null,
): WorkspacePulseViewModel | null {
  if (!observation) return null;

  return {
    message: observation.message,
    chips: CHIPS_BY_KIND[observation.kind] ?? [{ id: "dismiss", label: "Dismiss" }],
    cardIds: [...observation.cardIds],
  };
}

export interface WorkspaceAgentMessageViewModel {
  id: string;
  speaker: "user" | "assistant";
  text: string;
  pending: boolean;
}

/** Summary line for the sheet's context chips row. */
export interface WorkspaceAgentContextViewModel {
  workspaceName: string;
  groupLabel: string | null;
  selectedCount: number;
}

/**
 * A proposed tool action, projected for display only — inspectable, never something this
 * presenter (or the sheet it feeds) can execute. `toolSummary` is a plain-language render
 * of the closed `AgentToolIntent` union so the chip never has to import model internals.
 */
export interface WorkspaceAgentProposalViewModel {
  id: string;
  label: string;
  explanation: string;
  toolSummary: string;
  /** "proposed" → "pending-dispatch" → "done" | "failed" — see `WorkspaceAgentWorkflow`. */
  status: "proposed" | "pending-dispatch" | "done" | "failed";
  /** True once confirmed (any non-"proposed" status) — the confirm control disables. */
  isPendingDispatch: boolean;
  /** Truthful outcome text once status is "done" or "failed". */
  resultMessage?: string;
}

export interface WorkspaceAgentViewModel {
  isOpen: boolean;
  context: WorkspaceAgentContextViewModel;
  messages: WorkspaceAgentMessageViewModel[];
  /** True when there is nothing in the transcript yet. */
  isEmpty: boolean;
  proposals: WorkspaceAgentProposalViewModel[];
  isThinking: boolean;
  agentError: string | null;
}

const EMPTY_CONTEXT_VIEW: WorkspaceAgentContextViewModel = {
  workspaceName: "",
  groupLabel: null,
  selectedCount: 0,
};

/**
 * Projects the workflow's conversation state into the sheet's view model. `workspaces`
 * and `groupTitle` are looked up here rather than stored on the workflow, since the
 * workflow only knows ids and the workspace name can change out from under it.
 */
export function presentWorkspaceAgent(
  state: WorkspaceAgentState,
  workspaces: Workspace[],
  groupTitle: string | null,
): WorkspaceAgentViewModel {
  const workspace = workspaces.find((ws) => ws.id === state.workspaceId);

  const context: WorkspaceAgentContextViewModel = state.isOpen
    ? {
        workspaceName: workspace?.name ?? "",
        groupLabel: groupTitle,
        selectedCount: state.context.selectedCardIds.length,
      }
    : EMPTY_CONTEXT_VIEW;

  const messages = state.messages.map(toMessageViewModel);

  return {
    isOpen: state.isOpen,
    context,
    messages,
    isEmpty: messages.length === 0,
    proposals: state.proposals.map(toProposalViewModel),
    isThinking: state.isThinking,
    agentError: state.agentError,
  };
}

function toMessageViewModel(message: WorkspaceAgentMessage): WorkspaceAgentMessageViewModel {
  return {
    id: message.id,
    speaker: message.speaker,
    text: message.text,
    pending: message.pending ?? false,
  };
}

function toProposalViewModel(
  proposal: WorkspaceAgentProposalViewState
): WorkspaceAgentProposalViewModel {
  return {
    id: proposal.action.id,
    label: proposal.action.label,
    explanation: proposal.action.explanation,
    toolSummary: summarizeTool(proposal.action.tool),
    status: proposal.status,
    isPendingDispatch: proposal.status !== "proposed",
    resultMessage: proposal.resultMessage,
  };
}

/** Plain-language, one-line render of a tool intent for the proposal chip. Never executes it. */
function summarizeTool(tool: WorkspaceAgentProposalViewState["action"]["tool"]): string {
  switch (tool.type) {
    case "suggest_next_actions":
      return `Suggest: ${tool.suggestions.join("; ")}`;
    case "create_cards":
      return `Create ${tool.cards.length} card${tool.cards.length === 1 ? "" : "s"}`;
    case "create_group":
      return `Group ${tool.cardIds.length} card${tool.cardIds.length === 1 ? "" : "s"} as "${tool.name}"`;
    case "link_cards":
      return `Link two cards${tool.relation ? ` (${tool.relation})` : ""}`;
    case "chunk_cards":
      return `Chunk ${tool.cardIds.length} card${tool.cardIds.length === 1 ? "" : "s"} (${tool.mode})`;
    case "extract_url":
      return "Extract this source's URL";
    case "search_web":
      return `Search the web: ${tool.queries.join("; ")}`;
    case "make_study_candidates":
      return `Make ${tool.mode} study candidates from ${tool.cardIds.length} card${tool.cardIds.length === 1 ? "" : "s"}`;
    case "draft_experiment":
      return `Draft an experiment from ${tool.cardIds.length} card${tool.cardIds.length === 1 ? "" : "s"}`;
    case "ask_clarifying_question":
      return tool.question;
    default:
      return "Proposed action";
  }
}
