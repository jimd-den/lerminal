import { AppState } from "./LearnimalController";
import { DomainState, UiState } from "./AppSessionStore";
import { breadcrumbPath, directChildren } from "../../entities/tree";
import { ResearchState } from "../../usecases/research/ResearchWorkflow";
import { MissionState } from "../../usecases/mission/MissionWorkflow";
import { GoalArchitectState } from "../../usecases/goal/GoalArchitectWorkflow";
import { presentGoalArchitect } from "./GoalArchitectPresenter";
import { OperationsState } from "../../usecases/operations/OperationsWorkflow";
import { ReviewSessionState } from "../../usecases/review/ReviewSession";
import { GapReport } from "../../usecases/report/GapReportInteractor";

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
  /** The goal-architect session, projected through its own presenter. */
  goalArchitect: GoalArchitectState;
  /** Whether the session has enough to draft a mission — the workflow owns the rule. */
  canProposeMission: boolean;
  operations: OperationsState;
  review: ReviewSessionState;
  /** Recomputed per projection — the report is a view of current cards, never stored. */
  gapReport: GapReport | null;
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
    activeProfileIds: { ...domain.activeProfileIds },

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
    pinEditMode: ui.pinEditMode,
    isModalOpen: ui.isModalOpen,
    isWorkspaceSheetOpen: ui.isWorkspaceSheetOpen,
    isSettingsSheetOpen: ui.isSettingsSheetOpen,
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
    goalArchitect: presentGoalArchitect(input.goalArchitect, input.canProposeMission),

    isGapReportOpen: mission.isGapReportOpen,
    isMissionEditorOpen: mission.isEditorOpen,
    missionDraft: {
      ...mission.draft,
      successCriteria: [...mission.draft.successCriteria],
    },
  };
}
