import { AppState } from "./GriotController";
import { DomainState, UiState } from "./AppSessionStore";
import { breadcrumbPath, directChildren } from "../../entities/tree";
import { ResearchState } from "../../usecases/research/ResearchWorkflow";
import { MissionState } from "../../usecases/mission/MissionWorkflow";
import { OperationsState } from "../../usecases/operations/OperationsWorkflow";
import { ReviewSessionState } from "../../usecases/review/ReviewSession";
import { GapReport } from "../../usecases/report/GapReportInteractor";
import { WorkspaceAgentState } from "../../usecases/workspaceAgent/WorkspaceAgentWorkflow";
import { WorkspacePulseObservation } from "../../usecases/workspaceAgent/observeWorkspace";
import { BridgeState } from "../../usecases/bridge/BridgeWorkflow";
import { ThinkTankState } from "../../usecases/thinkTank/ThinkTankWorkflow";
import { presentWorkspaceAgent, presentWorkspacePulse } from "./WorkspaceAgentPresenter";
import { presentThinkTank } from "./ThinkTankPresenter";

/**
 * # App State Presenter
 *
 * ## Business Value & Purpose
 * Turns the four things the app knows — persisted domain data, on-screen UI flags, and
 * the state each workflow owns — into the single render-ready view model the UI consumes.
 *
 * It is a pure function on purpose. Projection used to be a 70-line method reaching into
 * `this` from inside the controller, which meant the one piece of logic every single
 * render depends on could only be exercised by constructing the entire application. Now
 * it can be checked directly, and the rule it enforces is visible: **the UI never
 * receives a live reference to internal state.** Every collection is copied on the way
 * out, so a component cannot mutate the session by holding onto what it rendered.
 */

export interface PresentAppStateInput {
  domain: DomainState;
  ui: UiState;
  research: ResearchState;
  mission: MissionState;
  operations: OperationsState;
  review: ReviewSessionState;
  /** Recomputed per projection — the report is a view of current cards, never stored. */
  gapReport: GapReport | null;
  /** Recomputed per projection from current cards — deterministic, no model call. */
  workspacePulseObservation: WorkspacePulseObservation | null;
  workspaceAgent: WorkspaceAgentState;
  /** Title of the group the Workspace Agent session's context points at, if any. */
  workspaceAgentGroupTitle: string | null;
  /** Title of the card currently open in the detail modal, if any — the focus card chip. */
  workspaceAgentFocusCardTitle?: string | null;
  /** Compact "Linked notes" list for the currently open card — see `AppState`. */
  linkedCardsForOpenCard: Array<{ cardId: string; title: string; relation?: string }>;
  /** The watch rotation's own state, passed through — see `AppState.bridge`. */
  bridge: BridgeState;
  /** The think tank's own state — see `AppState.thinkTank`. */
  thinkTank: ThinkTankState;
}

export function presentAppState(input: PresentAppStateInput): AppState {
  const { domain, ui, research, mission, operations, review } = input;

  return {
    // --- Appearance ---
    theme: domain.theme,
    accent: domain.accent,
    appearance: domain.appearance,

    // --- Workspace and cards ---
    workspaces: [...domain.workspaces],
    activeWorkspaceId: domain.activeWorkspaceId,
    cards: [...domain.cards],
    visibleCards: directChildren(domain.cards, domain.currentGroupId),
    currentGroupId: domain.currentGroupId,
    breadcrumb: breadcrumbPath(domain.cards, domain.currentGroupId),
    selection: new Set(domain.selection),

    // --- Vocabulary the user has customised ---
    pinnedCommands: [...domain.pinnedCommands],
    autoGroupByCommand: domain.autoGroupByCommand,
    interleaveReviews: domain.interleaveReviews,
    commandDefinitions: [...domain.commandDefinitions],
    cardTypes: [...domain.cardTypes],
    promptPresets: [...domain.promptPresets],
    assistantProfiles: [...domain.assistantProfiles],
    roundtables: [...domain.roundtables],
    activeProfileIds: { ...domain.activeProfileIds },
    agentPromptOverrides: { ...domain.agentPromptOverrides },
    webSearchEnabled: domain.webSearchEnabled,

    // --- Owned by ReviewSession ---
    reviewQueue: [...review.queue],
    reviewIndex: review.index,
    isReviewOpen: review.isOpen,
    reviewRevealAnswer: review.revealAnswer,

    // --- Settings ---
    openRouterKey: domain.openRouterKey,
    selectedModel: domain.selectedModel,
    customSystemPrompt: domain.customSystemPrompt,
    customChunkSystemPrompt: domain.customChunkSystemPrompt,
    availableModels: [...domain.availableModels],
    searchSiteFlags: domain.searchSiteFlags,
    isLoadingModels: ui.isLoadingModels,

    // --- Sheets, navigation, and transient flags ---
    pendingCommandName: ui.pendingCommandName,
    openCardId: ui.openCardId,
    linkedCardsForOpenCard: [...input.linkedCardsForOpenCard],
    pinEditMode: ui.pinEditMode,
    isModalOpen: ui.isModalOpen,
    isWorkspaceSheetOpen: ui.isWorkspaceSheetOpen,
    isSettingsSheetOpen: ui.isSettingsSheetOpen,
    isCaptureSheetOpen: ui.isCaptureSheetOpen,
    isAskGriotSheetOpen: ui.isAskGriotSheetOpen,
    isInputSheetOpen: ui.isInputSheetOpen,
    inputSheetMode: ui.inputSheetMode,
    activePreflightPresetId: ui.activePreflightPresetId,
    preflightQuery: ui.preflightQuery,
    aiQuerySuggestions: [...ui.aiQuerySuggestions],
    isSuggestingQueries: ui.isSuggestingQueries,
    captureIntent: ui.captureIntent,
    pendingGroupNavigation: ui.pendingGroupNavigation,
    isInstallingFont: ui.isInstallingFont,
    fontQuery: ui.fontQuery,
    fontCategory: ui.fontCategory,
    fontResults: [...ui.fontResults],
    isSearchingFonts: ui.isSearchingFonts,
    suggestedActionForCardId: ui.suggestedActionForCardId,
    suggestedActionId: ui.suggestedActionId,
    suggestedActionReason: ui.suggestedActionReason,
    isSuggestingNextAction: ui.isSuggestingNextAction,
    suggestedActionError: ui.suggestedActionError,
    fontCatalogError: ui.fontCatalogError,
    previewedFontFamilies: [...ui.previewedFontFamilies],
    storageError: ui.storageError,
    toastMessage: ui.toastMessage,
    chatStreamingCardId: ui.chatStreamingCardId,

    // --- Owned by OperationsWorkflow ---
    undoableOperationId: operations.undoableOperationId,
    pendingOperations: operations.pending,
    operationResult: operations.result,

    // --- Owned by ResearchWorkflow ---
    researchQuery: research.query,
    researchResults: [...research.results],
    isResearchOpen: research.isOpen,
    researchLoading: research.loading,
    researchError: research.error,
    isCreatingBrief: research.isCreatingBrief,

    // --- Owned by MissionWorkflow ---
    gapReport: input.gapReport,

    isGapReportOpen: mission.isGapReportOpen,
    isMissionEditorOpen: mission.isEditorOpen,
    missionDraft: {
      ...mission.draft,
      successCriteria: [...mission.draft.successCriteria],
    },

    // --- Owned by WorkspaceAgentWorkflow / observeWorkspace ---
    workspacePulse: presentWorkspacePulse(input.workspacePulseObservation),
    workspaceAgent: presentWorkspaceAgent(
      input.workspaceAgent,
      domain.workspaces,
      input.workspaceAgentGroupTitle,
      input.workspaceAgentFocusCardTitle ?? null,
      domain.cards,
      domain.roundtables,
    ),

    // --- Owned by BridgeWorkflow ---
    // Passed through rather than projected: the panel's projection needs a `now` to
    // compute contact ages against, and this function must stay free of the clock so the
    // same inputs always yield the same view model. See `BridgePresenter.presentBridge`.
    bridge: input.bridge,

    // --- Owned by ThinkTankWorkflow — a separate history from the ambient conversation ---
    thinkTank: presentThinkTank(input.thinkTank, domain.cards),
  };
}
