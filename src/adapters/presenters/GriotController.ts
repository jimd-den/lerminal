import { Card } from "../../entities/card";
import { Workspace } from "../../entities/workspace";
import { CardRepository } from "../../usecases/ports/repositories/CardRepository";
import { WorkspaceRepository } from "../../usecases/ports/repositories/WorkspaceRepository";
import {
  AppSettings,
  SettingsRepository,
} from "../../usecases/ports/repositories/SettingsRepository";
import { AgentGateway, AgentModel } from "../../usecases/ports/gateways/AgentGateway";
import { UseCaseError } from "../../usecases/errors";
import { PipelineOutcome, PipelineRunner } from "../../usecases/pipeline/PipelineRunner";
import {
  commandNameOf,
  commonParentId,
  describeRunOutput,
  shouldAutoGroup,
} from "../../usecases/pipeline/runOutcome";
import { CommandRegistry } from "../../usecases/pipeline/CommandRegistry";
import { CreateNote } from "../../usecases/card/CreateNote";
import { ChatMessage } from "../../usecases/ports/gateways/AgentGateway";
import { SearchGateway } from "../../usecases/ports/gateways/SearchGateway";
import { ExtractionGateway } from "../../usecases/ports/gateways/ExtractionGateway";
import { GroupCardsInteractor } from "../../usecases/grouping/GroupCardsInteractor";
import { expandForPipe } from "../../entities/tree";
import {
  CommandDefinition,
  isCommandVisibleInWorkspace,
} from "../../entities/commandDefinition";
import { CommandDefinitionRepository } from "../../usecases/ports/repositories/CommandDefinitionRepository";
import {
  BUILTIN_CARD_TYPES,
  CardTypeDefinition,
} from "../../entities/cardTypeDefinition";
import { CardTypeRepository } from "../../usecases/ports/repositories/CardTypeRepository";
import {
  BUILTIN_PROMPT_PRESETS,
  createPromptPreset,
  DEFAULT_CARD_INSTRUCTION,
  DEFAULT_CHUNK_INSTRUCTION,
  PromptPreset,
} from "../../entities/promptPreset";
import {
  AssistantProfile,
  AssistantCapability,
  BUILTIN_ASSISTANT_PROFILES,
  resolveAssistantProfile,
} from "../../entities/assistantProfile";
import { PromptPresetRepository } from "../../usecases/ports/repositories/PromptPresetRepository";
import { AssistantProfileRepository } from "../../usecases/ports/repositories/AssistantProfileRepository";
import { Logger, silentLogger } from "../../usecases/ports/Logger";
import {
  AppSessionStore,
  DEFAULT_CHUNK_SYSTEM_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
} from "./AppSessionStore";
import {
  OperationResult,
  OperationsWorkflow,
  PendingOperation,
} from "../../usecases/operations/OperationsWorkflow";
import { presentAppState } from "./presentAppState";
import { planDeletion } from "../../usecases/selection/deletionPlan";
import { ReviewSession } from "../../usecases/review/ReviewSession";
import { isPersistenceError } from "../../usecases/ports/PersistenceError";
import { PromptDesignResponse } from "../../usecases/ports/gateways/AgentGateway";
import {
  CreateCardTypeInteractor,
  CreateCardTypeRequest,
} from "../../usecases/cardTypes/CreateCardTypeInteractor";
import { DeleteCardTypeInteractor } from "../../usecases/cardTypes/DeleteCardTypeInteractor";
import {
  CreateCommandDefinitionInteractor,
  CreateCommandDefinitionRequest,
} from "../../usecases/commands/CreateCommandDefinitionInteractor";
import { DeleteCommandDefinitionInteractor } from "../../usecases/commands/DeleteCommandDefinitionInteractor";
import { DeleteCardInteractor } from "../../usecases/card/DeleteCardInteractor";
import { StartReviewInteractor } from "../../usecases/review/StartReviewInteractor";
import { GradeReviewInteractor } from "../../usecases/review/GradeReviewInteractor";
import { ReviewGrade } from "../../entities/schedule";
import { CreateWorkspaceInteractor } from "../../usecases/workspace/CreateWorkspaceInteractor";
import { SwitchWorkspaceInteractor } from "../../usecases/workspace/SwitchWorkspaceInteractor";
import { DeleteWorkspaceInteractor } from "../../usecases/workspace/DeleteWorkspaceInteractor";

import { SaveSettingsInteractor } from "../../usecases/settings/SaveSettingsInteractor";
import { LoadModelsInteractor } from "../../usecases/models/LoadModelsInteractor";
import { ExtractUrlInteractor } from "../../usecases/card/ExtractUrlInteractor";
import {
  FsrsScheduler,
  ReviewPreview,
} from "../../usecases/review/FsrsScheduler";
import { ReviewLogRepository } from "../../usecases/ports/repositories/ReviewLogRepository";
import { DEFAULT_FSRS_CONFIG } from "../../entities/workspace";
import {
  buildAgentRunRequest,
  buildPipelineText,
  findOperationPreset,
} from "../../usecases/agent/operationPresets";
import { ResearchResult } from "../../entities/research";
import { ResearchWorkflow } from "../../usecases/research/ResearchWorkflow";
import {
  MissionDraft,
  MissionWorkflow,
} from "../../usecases/mission/MissionWorkflow";
import { RunResearchInteractor } from "../../usecases/research/RunResearchInteractor";
import { ExtractResearchResultInteractor } from "../../usecases/research/ExtractResearchResultInteractor";
import { CreateResearchBriefInteractor } from "../../usecases/research/CreateResearchBriefInteractor";
import { SaveResearchResultAsSourceInteractor } from "../../usecases/research/SaveResearchResultAsSourceInteractor";
import { SuggestSearchQueriesInteractor } from "../../usecases/agent/SuggestSearchQueriesInteractor";
import { GenerateSyllabusInteractor } from "../../usecases/agent/GenerateSyllabusInteractor";
import { SuggestedActionDispatch } from "../../usecases/actions/SuggestedAction";
import { resolveCommandAlias } from "../../usecases/commands/commandCatalog";
import {
  AppearanceSettings,
  Density,
  FontChoice,
  MotionPreference,
  SurfaceTint,
} from "../../entities/appearance";
import { SuggestNextActionInteractor } from "../../usecases/capture/SuggestNextActionInteractor";
import {
  GoalArchitectWorkflow,
  GoalArchitectHost,
} from "../../usecases/goal/GoalArchitectWorkflow";
import { CreateMissionPlanInteractor } from "../../usecases/goal/CreateMissionPlanInteractor";
import { GoalQuestionId, RecommendedResearch } from "../../entities/goalArchitect";
import { GoalArchitectViewModel } from "./GoalArchitectPresenter";
import {
  FontCategory,
  FontFormat,
  RankedFontFamily,
} from "../../entities/fontCatalog";
import { PreviewFontInteractor } from "../../usecases/appearance/PreviewFontInteractor";
import { SearchFontsInteractor } from "../../usecases/appearance/SearchFontsInteractor";
import { createFailedRunCard, readFailedRunCard } from "../../entities/failedRun";
import { OperationLogRepository } from "../../usecases/ports/repositories/OperationLogRepository";
import { MemoryOperationLogRepository } from "../repositories/MemoryOperationLogRepository";
import { UndoOperationInteractor } from "../../usecases/undo/UndoOperationInteractor";
import { FontGateway } from "../../usecases/ports/gateways/FontGateway";
import {
  FontLoader,
  InstallFontInteractor,
  reloadInstalledFonts,
} from "../../usecases/appearance/InstallFontInteractor";
import { GapReport, GapReportInteractor, summarizeGapReportForPrompt } from "../../usecases/report/GapReportInteractor";
import { createWorkspaceMission, updateWorkspaceMission, WorkspaceMission, WorkspacePhase } from "../../entities/workspace";

// Default prompts are now *instructions* (the strict JSON format contract is appended
// by the gateway via composeCardPrompt), so users can edit them freely.
export { DEFAULT_SYSTEM_PROMPT, DEFAULT_CHUNK_SYSTEM_PROMPT };
export type { PendingOperation, OperationResult };

/**
 * # GRIOT Application State Model
 *
 * The public ViewModel consumed by the UI. It is composed from the controller's
 * internal {@link DomainState} (business data) and {@link UiState} (ephemeral
 * presentation flags) — see {@link GriotController.getState}.
 */
/**
 * Re-exported so the UI layer keeps importing its types from the controller rather than
 * reaching into `usecases/` — see `actions/SuggestedAction.ts` for the definition.
 */
export type { SuggestedActionDispatch };

/** Editable draft used while creating/editing a workspace's mission. */
export type { MissionDraft };

export interface AppState {
  theme: "dark" | "light";
  accent: "teal" | "lilac" | "amber" | "rose" | "arctic";
  /** Palette and typeface customisation (see `entities/appearance.ts`). */
  appearance: AppearanceSettings;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  cards: Card[];
  /** Cards directly under the current group (what the canvas should render). */
  visibleCards: Card[];
  /** The group the user is currently viewing (null = workspace root). */
  currentGroupId: string | null;
  /** Group cards from the root down to the current group, for breadcrumbs. */
  breadcrumb: Card[];
  selection: Set<string>;
  pinnedCommands: string[];
  autoGroupByCommand: boolean;
  /** When true, review sessions interleave cards across topics/groups. */
  interleaveReviews: boolean;
  /** User-defined custom commands available in the palette and pipelines. */
  commandDefinitions: CommandDefinition[];
  /** Card type registry (seeded built-ins + user-defined types). */
  cardTypes: CardTypeDefinition[];
  /** Card-generation instruction presets (seeded built-ins + user-defined). */
  promptPresets: PromptPreset[];
  /** Goal-specific AI Assistance Profiles. */
  assistantProfiles: AssistantProfile[];
  /** Active assistant profile ID per capability. */
  activeProfileIds: Partial<Record<AssistantCapability, string>>;
  /** Command awaiting input in the input sheet (so submit re-runs the right one). */
  pendingCommandName: string;
  openCardId: string | null;
  reviewQueue: Card[];
  reviewIndex: number;
  isReviewOpen: boolean;
  reviewRevealAnswer: boolean;
  pinEditMode: boolean;
  isModalOpen: boolean;
  isWorkspaceSheetOpen: boolean;
  isSettingsSheetOpen: boolean;
  isInputSheetOpen: boolean;
  inputSheetMode: "source" | "ask" | "note";
  /** The operation preset id currently shown in the AI preflight sheet (null = closed). */
  activePreflightPresetId: string | null;
  /** Free-text query the user has typed into the open preflight sheet. */
  preflightQuery: string;
  /** AI-generated search-query suggestions for the open preflight (research-web only). */
  aiQuerySuggestions: string[];
  /** True while a query-suggestion request is in flight. */
  isSuggestingQueries: boolean;
  /** A capture screen the UI should navigate to, set by a `capture` dispatch. */
  captureIntent: "note" | "paste" | "link" | "ask" | null;
  /**
   * A group the shell should open, set when a run creates one. The controller decides
   * *which* group; navigating there is the shell's job, so this is consumed once.
   */
  pendingGroupNavigation: string | null;
  /** True while a Google font download is in flight. */
  isInstallingFont: boolean;
  /** The current font-browser query, owned here so results and query never disagree. */
  fontQuery: string;
  /** Category filter for the font browser, or null for all categories. */
  fontCategory: FontCategory | null;
  /** Ranked font-browser results for {@link UiState.fontQuery}. */
  fontResults: RankedFontFamily[];
  /** True while the font catalog or a search is loading. */
  isSearchingFonts: boolean;
  /** Id of the card the "ask GRIOT what's next" suggestion is for, or null when idle. */
  suggestedActionForCardId: string | null;
  suggestedActionId: string | null;
  suggestedActionReason: string | null;
  isSuggestingNextAction: boolean;
  suggestedActionError: string | null;
  /**
   * Set when the catalog itself couldn't be fetched. The browser is then unavailable and
   * the UI should say so and fall back to install-by-name — an empty list would read as
   * "nothing matched", which is a different and untrue claim.
   */
  fontCatalogError: string | null;
  /** Families whose real typeface has loaded and can safely be rendered in previews. */
  previewedFontFamilies: string[];
  /** The id of the most recent undoable operation, or null when there's nothing to undo. */
  undoableOperationId: string | null;
  /** Set when storage could not be read; the library is unknown, not empty. */
  storageError: string | null;
  toastMessage: string;
  openRouterKey: string;
  selectedModel: string;
  customSystemPrompt: string;
  customChunkSystemPrompt: string;
  availableModels: AgentModel[];
  isLoadingModels: boolean;
  pendingOperations: PendingOperation[];
  operationResult: OperationResult | null;
  searchSiteFlags: Record<string, string>;
  /** The chat card currently streaming an assistant reply (null = none). */
  chatStreamingCardId: string | null;
  /** The query the active research session was run with (see startResearch). */
  researchQuery: string;
  /** Inspectable source candidates from the active research session. */
  researchResults: ResearchResult[];
  /** Whether the research results sheet is open. */
  isResearchOpen: boolean;
  /** True while the initial search or an extraction is in flight. */
  researchLoading: boolean;
  /** Set when the search itself failed/returned nothing; shown instead of results. */
  researchError: string | null;
  /** True while a cited brief is being synthesized. */
  isCreatingBrief: boolean;
  /** Deterministic gap/status report for the active workspace, or null with no active workspace. */
  gapReport: GapReport | null;
  /** Whether the full gap report sheet is open (the compact Mission Control module needs no open state). */
  isGapReportOpen: boolean;
  /** Whether the mission editor sheet is open. */
  isMissionEditorOpen: boolean;
  /** The in-progress mission edit, valid while `isMissionEditorOpen`. */
  missionDraft: MissionDraft;
  /** The goal-architect sheet's full view model. */
  goalArchitect: GoalArchitectViewModel;
}

/** What a completed run hands to the undo log once its cards have settled. */
interface PendingRunRecord {
  createdCardIds: string[];
  summary: string;
  destinationGroupId?: string;
}

export interface GriotControllerDeps {
  cardRepo: CardRepository;
  workspaceRepo: WorkspaceRepository;
  settingsRepo: SettingsRepository;
  agentGateway: AgentGateway;
  commandDefinitionRepo: CommandDefinitionRepository;
  cardTypeRepo: CardTypeRepository;
  promptPresetRepo: PromptPresetRepository;
  assistantProfileRepo: AssistantProfileRepository;
  /** Where the controller reports failures; defaults to saying nothing. */
  logger?: Logger;
  searchGateway: SearchGateway;
  extractionGateway: ExtractionGateway;
  reviewLogRepo?: ReviewLogRepository;
  /** Persists run receipts so the last operation can be undone. */
  operationLogRepo?: OperationLogRepository;
  /** Resolves a font family name to a downloadable file. Optional so tests can omit it. */
  fontGateway?: FontGateway;
  /** Registers a downloaded font with the platform. Optional so tests can omit it. */
  fontLoader?: FontLoader;
  /**
   * Font formats this platform can render, best first. Supplied by the composition root
   * because it is a property of the host, not of the app. Defaults to native TTF/OTF.
   */
  fontFormats?: FontFormat[];
}

/**
 * # GRIOT Main Application Controller (Clean Architecture Interface Adapter)
 *
 * ## Business Value & Purpose
 * Coordinates application state and the UI. It is a thin presenter: it holds the
 * split {@link DomainState}/{@link UiState}, delegates every real operation to a
 * single-responsibility use-case interactor, applies the returned response models
 * to state, maps {@link UseCaseError}s to toasts, and notifies subscribers. The UI
 * stays a dumb mapping of {@link AppState} to widgets.
 */
export class GriotController {
  private cardRepo: CardRepository;
  private workspaceRepo: WorkspaceRepository;
  private settingsRepo: SettingsRepository;
  private agentGateway: AgentGateway;
  private commandDefinitionRepo: CommandDefinitionRepository;
  private cardTypeRepo: CardTypeRepository;
  private promptPresetRepo: PromptPresetRepository;
  private assistantProfileRepo: AssistantProfileRepository;
  private logger: Logger;

  private pipeline: PipelineRunner;
  private startReviewInteractor: StartReviewInteractor;
  private gradeReviewInteractor: GradeReviewInteractor;
  private createWorkspaceInteractor: CreateWorkspaceInteractor;
  private switchWorkspaceInteractor: SwitchWorkspaceInteractor;
  private deleteWorkspaceInteractor: DeleteWorkspaceInteractor;
  private saveSettingsInteractor: SaveSettingsInteractor;
  private loadModelsInteractor: LoadModelsInteractor;
  private createCommandDefinitionInteractor: CreateCommandDefinitionInteractor;
  private deleteCommandDefinitionInteractor: DeleteCommandDefinitionInteractor;
  private createCardTypeInteractor: CreateCardTypeInteractor;
  private deleteCardTypeInteractor: DeleteCardTypeInteractor;
  private deleteCardInteractor: DeleteCardInteractor;
  private createNoteUseCase: CreateNote;
  private suggestNextActionInteractor: SuggestNextActionInteractor;
  private extractUrlInteractor: ExtractUrlInteractor;
  private groupCardsInteractor: GroupCardsInteractor;
  private fsrsScheduler: FsrsScheduler;
  private reviewLogRepo?: ReviewLogRepository;
  private research: ResearchWorkflow;
  private mission: MissionWorkflow;
  private goalArchitect: GoalArchitectWorkflow;
  private createMissionPlanInteractor: CreateMissionPlanInteractor;
  /** When the current goal session began, for an accurate receipt. */
  private goalSessionStartedAt = 0;
  private runResearchInteractor: RunResearchInteractor;
  private extractResearchResultInteractor: ExtractResearchResultInteractor;
  private createResearchBriefInteractor: CreateResearchBriefInteractor;
  private saveResearchResultAsSourceInteractor: SaveResearchResultAsSourceInteractor;
  private suggestSearchQueriesInteractor: SuggestSearchQueriesInteractor;
  private generateSyllabusInteractor: GenerateSyllabusInteractor;
  private gapReportInteractor: GapReportInteractor;
  private installFontInteractor: InstallFontInteractor;
  private searchFontsInteractor: SearchFontsInteractor;
  private previewFontInteractor: PreviewFontInteractor;
  /** Guards against a slow search result overwriting a newer one — see {@link searchFonts}. */
  private fontSearchToken = 0;
  private operationLogRepo: OperationLogRepository;
  private undoOperationInteractor: UndoOperationInteractor;
  private fontLoader: FontLoader;

  /** Built-in pipeline commands; combined with custom commands by rebuildPipeline. */
  private commandRegistry: CommandRegistry;

  private readonly session: AppSessionStore<AppState> = new AppSessionStore(() =>
    this.getState(),
  );
  private operations: OperationsWorkflow;
  private review: ReviewSession;

  /** The session's two state halves, addressed directly for readability at call sites. */
  private get domain() {
    return this.session.domain;
  }
  private get ui() {
    return this.session.ui;
  }
  private workspaceLoadToken = 0;
  private pendingPipelineResume: {
    command: string;
    remainingPipeline: string;
    inputCardIds: string[];
    parentId: string | null;
  } | null = null;

  constructor(deps: GriotControllerDeps) {
    this.cardRepo = deps.cardRepo;
    this.workspaceRepo = deps.workspaceRepo;
    this.settingsRepo = deps.settingsRepo;
    this.agentGateway = deps.agentGateway;
    this.commandDefinitionRepo = deps.commandDefinitionRepo;
    this.cardTypeRepo = deps.cardTypeRepo;
    this.promptPresetRepo = deps.promptPresetRepo;
    this.assistantProfileRepo = deps.assistantProfileRepo;
    this.logger = deps.logger ?? silentLogger;

    // Which commands exist, and how a runner is built from them, belongs to the
    // registry; the controller only asks it to rebuild when definitions change.
    this.createNoteUseCase = new CreateNote(deps.cardRepo);
    this.suggestNextActionInteractor = new SuggestNextActionInteractor(deps.agentGateway);
    this.groupCardsInteractor = new GroupCardsInteractor(deps.cardRepo);
    this.commandRegistry = new CommandRegistry({
      cardRepo: deps.cardRepo,
      settingsRepo: deps.settingsRepo,
      agentGateway: deps.agentGateway,
      searchGateway: deps.searchGateway,
      extractionGateway: deps.extractionGateway,
      createNote: this.createNoteUseCase,
      groupCards: this.groupCardsInteractor,
      logger: this.logger,
    });
    this.pipeline = this.commandRegistry.getRunner();

    this.createCommandDefinitionInteractor =
      new CreateCommandDefinitionInteractor(deps.commandDefinitionRepo);
    this.deleteCommandDefinitionInteractor =
      new DeleteCommandDefinitionInteractor(deps.commandDefinitionRepo);
    this.createCardTypeInteractor = new CreateCardTypeInteractor(
      deps.cardTypeRepo,
    );
    this.deleteCardTypeInteractor = new DeleteCardTypeInteractor(
      deps.cardTypeRepo,
    );
    this.deleteCardInteractor = new DeleteCardInteractor(deps.cardRepo);
    this.fsrsScheduler = new FsrsScheduler();
    this.reviewLogRepo = deps.reviewLogRepo;
    this.startReviewInteractor = new StartReviewInteractor();
    this.gradeReviewInteractor = new GradeReviewInteractor(
      deps.cardRepo,
      this.fsrsScheduler,
      this.reviewLogRepo,
    );
    this.createWorkspaceInteractor = new CreateWorkspaceInteractor(
      deps.workspaceRepo,
    );
    this.switchWorkspaceInteractor = new SwitchWorkspaceInteractor(
      deps.cardRepo,
    );
    this.deleteWorkspaceInteractor = new DeleteWorkspaceInteractor(
      deps.workspaceRepo,
      deps.cardRepo,
    );
    this.saveSettingsInteractor = new SaveSettingsInteractor(deps.settingsRepo);
    this.loadModelsInteractor = new LoadModelsInteractor(deps.agentGateway);
    this.extractUrlInteractor = new ExtractUrlInteractor(
      deps.extractionGateway,
      deps.cardRepo,
    );
    this.runResearchInteractor = new RunResearchInteractor(deps.searchGateway);
    this.extractResearchResultInteractor = new ExtractResearchResultInteractor(
      deps.extractionGateway,
    );
    this.createResearchBriefInteractor = new CreateResearchBriefInteractor(
      deps.agentGateway,
      deps.cardRepo,
    );
    this.saveResearchResultAsSourceInteractor = new SaveResearchResultAsSourceInteractor(
      deps.cardRepo,
    );
    this.suggestSearchQueriesInteractor = new SuggestSearchQueriesInteractor(
      deps.agentGateway,
    );
    this.generateSyllabusInteractor = new GenerateSyllabusInteractor(
      deps.agentGateway,
      deps.cardRepo,
    );
    this.gapReportInteractor = new GapReportInteractor();

    this.operationLogRepo = deps.operationLogRepo ?? new MemoryOperationLogRepository();
    this.undoOperationInteractor = new UndoOperationInteractor(
      deps.cardRepo,
      this.operationLogRepo,
    );
    this.fontLoader = deps.fontLoader ?? {
      async load() {
        throw new Error("Font loading isn't available here");
      },
    };
    // A gateway that fails honestly, for tests and any host where fonts aren't wired up.
    const fontGateway: FontGateway = deps.fontGateway ?? {
      async resolveFont() {
        throw new Error("Font downloading isn't available here");
      },
      async listFamilies() {
        throw new Error("Font browsing isn't available here");
      },
    };
    this.installFontInteractor = new InstallFontInteractor(
      fontGateway,
      this.fontLoader,
      deps.fontFormats,
    );
    this.searchFontsInteractor = new SearchFontsInteractor(fontGateway);
    // Previews reuse the install path but are never persisted — see the interactor.
    this.previewFontInteractor = new PreviewFontInteractor(this.installFontInteractor);

    // Each cohesive slice of the app owns its own state and orchestration; the controller
    // supplies context and effects, then delegates to it.
    this.research = this.buildResearchWorkflow(deps);
    this.mission = this.buildMissionWorkflow(deps);
    this.goalArchitect = this.buildGoalArchitectWorkflow(deps);
    this.createMissionPlanInteractor = new CreateMissionPlanInteractor(
      deps.cardRepo,
      deps.workspaceRepo,
      this.operationLogRepo,
    );
    this.operations = this.buildOperationsWorkflow(deps);
    this.review = this.buildReviewSession(deps);

  }

  /**
   * Wires the web-research loop: search, keep, extract, cite.
   *
   * The host object is the seam: it hands the workflow the surrounding context it needs
   * to read and the effects it needs to cause, without handing over the controller itself.
   */
  private buildResearchWorkflow(deps: GriotControllerDeps): ResearchWorkflow {
      return new ResearchWorkflow({
        runResearch: this.runResearchInteractor,
        extractResult: this.extractResearchResultInteractor,
        saveAsSource: this.saveResearchResultAsSourceInteractor,
        createBrief: this.createResearchBriefInteractor,
        host: {
          context: () => ({
            workspaceId: this.domain.activeWorkspaceId,
            parentId: this.domain.currentGroupId,
            apiKey: this.domain.openRouterKey,
            model: this.domain.selectedModel,
          }),
          onChange: () => this.emit(),
          notify: (message) => this.showToast(message),
          onSourceSaved: async (workspaceId) => {
            if (this.domain.activeWorkspaceId === workspaceId) {
              await this.loadCardsForActiveWorkspace();
            }
            this.emit();
          },
          onBriefCreated: async ({ created, keptCount, workspaceId, parentId }) => {
            this.operations.present({
              summary: `${created.length} cited claim${created.length === 1 ? "" : "s"} created from ${keptCount} kept source(s)`,
              createdCardIds: created.map((card) => card.id),
              destination: { spaceId: workspaceId, groupId: parentId ?? undefined },
              primaryActionLabel: "Open result",
            });
            if (this.domain.activeWorkspaceId === workspaceId) {
              this.domain.selection = new Set(created.map((card) => card.id));
              await this.loadCardsForActiveWorkspace();
            }
            this.emit();
          },
        },
      });
  }

  /**
   * Wires Mission Control: the goal, the deterministic gap report, the syllabus.
   *
   * The host object is the seam: it hands the workflow the surrounding context it needs
   * to read and the effects it needs to cause, without handing over the controller itself.
   */
  /**
   * Wires the goal architect to the app around it.
   *
   * The host's only web-facing method hands queries to the *existing* research preflight
   * rather than running a search, which is what keeps "the agent never browses without
   * approval" true by construction instead of by convention.
   */
  private buildGoalArchitectWorkflow(
    deps: GriotControllerDeps,
  ): GoalArchitectWorkflow {
    const host: GoalArchitectHost = {
      apiKey: () => this.domain.openRouterKey ?? "",
      model: () => this.domain.selectedModel,
      systemPrompt: () =>
        resolveAssistantProfile(
          "goal-architect",
          this.domain.activeProfileIds,
          this.domain.assistantProfiles,
          BUILTIN_ASSISTANT_PROFILES,
          undefined,
          this.domain.activeWorkspaceId ?? undefined,
        ).systemPrompt,
      onChange: () => this.emit(),
      requestResearchApproval: (queries: RecommendedResearch[]) => {
        // Pre-fills the normal preflight; the user still sees and approves the query.
        this.ui.activePreflightPresetId = "research-web";
        this.ui.preflightQuery = queries[0]?.query ?? "";
        this.ui.aiQuerySuggestions = queries.map((item) => item.query);
        this.emit();
      },
    };

    return new GoalArchitectWorkflow({ host, agentGateway: deps.agentGateway });
  }

  // --- Goal Architect ---

  /** Opens a fresh goal session. */
  openGoalArchitect(): void {
    this.goalSessionStartedAt = Date.now();
    this.goalArchitect.open();
  }

  closeGoalArchitect(): void {
    this.goalArchitect.close();
  }

  submitGoalAnswer(text: string): void {
    this.goalArchitect.submitAnswer(text);
  }

  skipGoalQuestion(): void {
    this.goalArchitect.skipCurrent();
  }

  editGoalAnswer(questionId: GoalQuestionId, text: string): void {
    this.goalArchitect.editAnswer(questionId, text);
  }

  /** Explicitly asks the model for suggestions. Never automatic. */
  async requestGoalAgentTurn(): Promise<void> {
    await this.goalArchitect.requestAgentTurn();
  }

  /** Opts the *next* agent turn into the provider's own web search, or opts back out. */
  setGoalWebSearchEnabled(enabled: boolean): void {
    this.goalArchitect.setWebSearchEnabled(enabled);
  }

  proposeMission(): void {
    this.goalArchitect.proposeMission();
  }

  backToGoalQuestions(): void {
    this.goalArchitect.backToQuestions();
  }

  requestGoalResearch(): void {
    this.goalArchitect.requestResearch();
  }

  /**
   * Accepts the draft: creates the mission cards, sets the workspace mission, and leaves
   * the user on the canvas with a receipt they can undo.
   *
   * The receipt is built from what the session actually recorded — whether a model
   * contributed, whether a search really ran — so it can never credit work that did not
   * happen.
   */
  async acceptMission(): Promise<boolean> {
    const session = this.goalArchitect.state;
    const proposal = session.proposal;
    const workspaceId = this.domain.activeWorkspaceId;

    if (!proposal || !workspaceId) return false;

    const operationId = this.addPendingOperation("Creating mission");
    try {
      const outcome = await this.createMissionPlanInteractor.execute({
        workspaceId,
        proposal,
        map: session.map,
        answerIds: session.answers.map((answer) => answer.questionId),
        modelUsed: session.modelUsed,
        webUsed: session.webUsed,
        model: session.modelUsed ? this.domain.selectedModel : undefined,
        startedAt: this.goalSessionStartedAt || Date.now(),
      });

      this.removePendingOperation(operationId);
      this.goalArchitect.close();
      await this.loadCardsForActiveWorkspace();

      // Selection genuinely changes here, so saying so is accurate.
      this.domain.selection = new Set(
        outcome.cards.filter((card) => card.id !== outcome.group.id).map((card) => card.id),
      );
      this.domain.workspaces = this.domain.workspaces.map((workspace) =>
        workspace.id === outcome.workspace.id ? outcome.workspace : workspace,
      );

      this.operations.present({
        summary: outcome.operation.summary,
        createdCardIds: outcome.operation.createdCardIds,
        destination: { spaceId: workspaceId, groupId: outcome.group.id },
        primaryActionLabel: "Open mission",
      });
      // The interactor already wrote the receipt — it knows what actually ran. This only
      // points undo at it, rather than logging a second, vaguer record of the same run.
      this.operations.markUndoable(outcome.operation.id);
      this.emit();
      return true;
    } catch (error: any) {
      this.setPendingOperationError(
        operationId,
        error instanceof UseCaseError ? error.userMessage : "Couldn't create the mission",
      );
      return false;
    }
  }

  private buildMissionWorkflow(deps: GriotControllerDeps): MissionWorkflow {
      return new MissionWorkflow({
        workspaceRepo: deps.workspaceRepo,
        gapReport: this.gapReportInteractor,
        generateSyllabus: this.generateSyllabusInteractor,
        host: {
          activeWorkspace: () => this.activeWorkspace(),
          cards: () => this.domain.cards,
          apiKey: () => this.domain.openRouterKey ?? "",
          model: () => this.domain.selectedModel,
          onChange: () => this.emit(),
          notify: (message) => this.showToast(message),
          onWorkspaceSaved: (workspace) => {
            this.domain.workspaces = this.domain.workspaces.map((w) =>
              w.id === workspace.id ? workspace : w,
            );
          },
          openStatusReportPreflight: (prompt) => {
            this.ui.activePreflightPresetId = "status-report";
            this.ui.preflightQuery = prompt;
            this.emit();
          },
          onSyllabusCreated: async ({ group, items, workspaceId }) => {
            if (this.domain.activeWorkspaceId === workspaceId) {
              await this.loadCardsForActiveWorkspace();
              this.domain.selection = new Set(items.map((card) => card.id));
            }
            this.operations.present({
              summary: `Syllabus created: ${items.length} prerequisite topic${items.length === 1 ? "" : "s"}`,
              createdCardIds: [group.id, ...items.map((card) => card.id)],
              destination: { spaceId: workspaceId, groupId: group.id },
              primaryActionLabel: "Open syllabus",
            });
            this.emit();
          },
          beginOperation: (label) => this.addPendingOperation(label),
          endOperation: (id) => this.removePendingOperation(id),
          failOperation: (id, message) => this.setPendingOperationError(id, message),
        },
      });
  }

  /**
   * Wires the run lifecycle: in-flight activity, receipts, and undo.
   *
   * The host object is the seam: it hands the workflow the surrounding context it needs
   * to read and the effects it needs to cause, without handing over the controller itself.
   */
  private buildOperationsWorkflow(deps: GriotControllerDeps): OperationsWorkflow {
      return new OperationsWorkflow({
        operationLog: this.operationLogRepo,
        undoOperation: this.undoOperationInteractor,
        host: {
          cards: () => this.domain.cards,
          activeWorkspaceId: () => this.domain.activeWorkspaceId,
          onChange: () => this.emit(),
          notify: (message) => this.showToast(message),
          forgetCards: (removedCardIds) => this.session.forgetCards(removedCardIds),
          refreshCards: () => this.loadCardsForActiveWorkspace(),
          navigateToResult: async (result) => {
            if (result.destination.spaceId !== this.domain.activeWorkspaceId) {
              await this.switchWorkspace(result.destination.spaceId);
            }
            if (this.domain.activeWorkspaceId !== result.destination.spaceId) return;
            this.domain.currentGroupId = result.destination.groupId ?? null;
            this.session.select(result.createdCardIds);
          },
        },
      });
      // A no-op loader keeps the controller constructible in tests and on any platform
      // where font installation isn't wired up; installFont then simply fails honestly.
  }

  /**
   * Wires the study session over the FSRS scheduler.
   *
   * The host object is the seam: it hands the workflow the surrounding context it needs
   * to read and the effects it needs to cause, without handing over the controller itself.
   */
  private buildReviewSession(deps: GriotControllerDeps): ReviewSession {
      return new ReviewSession({
        startReview: this.startReviewInteractor,
        gradeReview: this.gradeReviewInteractor,
        scheduler: this.fsrsScheduler,
        host: {
          cards: () => this.domain.cards,
          cardTypes: () => this.domain.cardTypes,
          interleaveReviews: () => this.domain.interleaveReviews,
          schedulerConfig: () =>
            this.activeWorkspace()?.fsrsConfig ?? DEFAULT_FSRS_CONFIG,
          onChange: () => this.emit(),
          notify: (message) => this.showToast(message),
          onCardGraded: (card) => {
            this.domain.cards = this.domain.cards.map((existing) =>
              existing.id === card.id ? card : existing,
            );
          },
          refreshCards: () => this.loadCardsForActiveWorkspace(),
        },
      });
  }


  /**
   * Initializes the application by fetching workspaces and initial settings.
   */
  async init(): Promise<void> {
    try {
      this.ui.storageError = null;
      this.domain.workspaces = await this.workspaceRepo.getWorkspaces();

      const settings = await this.settingsRepo.getSettings();
      if (settings) {
        this.domain.theme = settings.theme || "dark";
        this.domain.accent = settings.accent || "teal";
        this.domain.appearance = settings.appearance ?? {};
        this.domain.openRouterKey = settings.openRouterKey || "";
        this.domain.selectedModel = settings.selectedModel || "";
        this.domain.customSystemPrompt =
          settings.customSystemPrompt || DEFAULT_SYSTEM_PROMPT;
        this.domain.customChunkSystemPrompt =
          settings.customChunkSystemPrompt || DEFAULT_CHUNK_SYSTEM_PROMPT;
        this.domain.autoGroupByCommand = settings.autoGroupByCommand ?? true;
        this.domain.interleaveReviews = settings.interleaveReviews ?? true;
        if (settings.activeProfileIds) {
          this.domain.activeProfileIds = {
            ...this.domain.activeProfileIds,
            ...settings.activeProfileIds,
          } as Partial<Record<AssistantCapability, string>>;
        }
        if (settings.searchSiteFlags) {
          this.domain.searchSiteFlags = settings.searchSiteFlags;
        }
      } else {
        this.domain.customSystemPrompt = DEFAULT_SYSTEM_PROMPT;
        this.domain.customChunkSystemPrompt = DEFAULT_CHUNK_SYSTEM_PROMPT;
      }

      this.domain.commandDefinitions =
        await this.commandDefinitionRepo.getDefinitions();
      this.domain.cardTypes = await this.loadCardTypes();
      this.domain.promptPresets = await this.loadPromptPresets();
      this.domain.assistantProfiles = await this.loadAssistantProfiles();

      // Captured before the default workspace is created, so "nothing here yet" is
      // distinguishable from "a workspace was just made for you". A storage failure
      // throws to the catch below rather than reaching here, so a first run can never be
      // confused with an unreadable library.
      const isFirstLaunch = this.domain.workspaces.length === 0;

      if (isFirstLaunch) {
        const defaultWs =
          await this.createWorkspaceInteractor.execute("My Workspace");
        this.domain.workspaces.push(defaultWs);
        this.domain.activeWorkspaceId = defaultWs.id;
      } else {
        this.domain.activeWorkspaceId = this.domain.workspaces[0].id;
      }
      // Built only now that activeWorkspaceId has its real, final value — a
      // workspace-scoped command filters on it, and building the pipeline any earlier
      // would filter against whatever the field happened to hold before this point.
      this.rebuildPipeline();
      await this.loadCardsForActiveWorkspace();

      // A genuinely empty first launch opens the goal architect. It is a sheet over the
      // canvas, not a gate: dismissing it leaves the blank workspace that was just
      // created, which is exactly the no-assistance path.
      if (isFirstLaunch && this.domain.cards.length === 0) {
        this.openGoalArchitect();
        this.goalArchitect.markFirstRun();
      }
      this.loadAvailableModels();
      // Not awaited: a slow or failed font fetch must never delay first paint.
      void this.restoreInstalledFonts();
      this.emit();
      this.logger.debug("controller.init.success");
    } catch (error) {
      this.logger.error("controller.init.failed", error);
      // A storage failure is reported as itself, never as an empty library: the UI must
      // be able to offer a retry rather than invite the user to start over on top of
      // data that is still there.
      this.ui.storageError = isPersistenceError(error)
        ? "Your saved work could not be opened. Nothing has been changed."
        : null;
      this.showToast(
        this.ui.storageError ? "Could not open your library" : "Initialization failed",
      );
      this.emit();
    }
  }

  /**
   * Retries a failed startup. Safe to call repeatedly: `init` reloads from storage and
   * clears the failure only once a read actually succeeds.
   */
  async retryInit(): Promise<void> {
    await this.init();
  }

  /**
   * Subscribes a listener function to be called on every state update.
   *
   * @param listener The state change callback.
   * @returns An unsubscribe function.
   */
  subscribe(listener: (state: AppState) => void): () => void {
    return this.session.subscribe(listener);
  }

  /**
   * Retrieves the current immutable ViewModel, composed from domain + UI state.
   */
  /**
   * The current view model. Composition is delegated to {@link presentAppState}, so this
   * stays a one-line boundary between "what the app knows" and "what the UI renders".
   */
  getState(): AppState {
    return presentAppState({
      domain: this.domain,
      ui: this.ui,
      research: this.research.state,
      mission: this.mission.state,
      goalArchitect: this.goalArchitect.state,
      canProposeMission: this.goalArchitect.canPropose,
      operations: this.operations.state,
      review: this.review.state,
      gapReport: this.mission.computeGapReport(),
    });
  }

  // --- Selection Methods ---

  /**
   * Fast, direct note capture use case. Persists a new note item directly
   * into the active workspace without requiring AI generation or pipeline execution.
   */
  async createNote(params: {
    content: string;
    title?: string;
    parentId?: string;
  }): Promise<Card> {
    const workspaceId = this.domain.activeWorkspaceId;
    if (!workspaceId) {
      throw new Error("No active workspace to create note");
    }

    const note = await this.createNoteUseCase.execute({
      workspaceId,
      parentId: params.parentId || this.domain.currentGroupId || undefined,
      title: params.title,
      content: params.content,
    });

    if (this.domain.activeWorkspaceId === workspaceId) {
      await this.loadCardsForActiveWorkspace();
      if (this.domain.activeWorkspaceId === workspaceId) {
        this.domain.selection = new Set([note.id]);
        // Capture must lead somewhere: a note now produces the same receipt a pipeline
        // run does, so the confirmation carries next actions instead of a bare toast.
        this.operations.present({
          summary: "Note captured",
          createdCardIds: [note.id],
          destination: {
            spaceId: workspaceId,
            groupId: note.parentId,
            cardId: note.id,
          },
          primaryActionLabel: "Open note",
        });
        this.emit();
      }
    }
    this.logger.debug("note.created", { cardId: note.id });
    return note;
  }

  toggleSelect(cardId: string): void {
    if (this.domain.selection.has(cardId)) {
      this.domain.selection.delete(cardId);
    } else {
      this.domain.selection.add(cardId);
    }
    this.emit();
  }

  clearSelection(): void {
    this.domain.selection.clear();
    this.emit();
  }

  setSelection(cardIds: Iterable<string>): void {
    this.domain.selection = new Set(cardIds);
    this.emit();
  }

  /** Deletes the current selection as one user operation. */
  /**
   * Deletes the selection. What that means — which cards, in what order, and where the
   * user ends up — is decided by {@link planDeletion} before anything is touched.
   */
  async deleteSelection(recursiveGroups: boolean): Promise<void> {
    const plan = planDeletion({
      cards: this.domain.cards,
      selectedIds: new Set(this.domain.selection),
      currentGroupId: this.domain.currentGroupId,
      recursiveGroups,
    });

    for (const card of plan.toDelete) {
      await this.deleteCardInteractor.execute(
        card,
        recursiveGroups && card.type === "group",
      );
    }

    this.domain.currentGroupId = plan.nextGroupId;
    this.session.select([]);
    this.ui.openCardId = null;
    await this.loadCardsForActiveWorkspace();
    this.emit();
    this.showToast(
      `${plan.selected.length} item${plan.selected.length === 1 ? "" : "s"} deleted`,
    );
  }

  // --- Card Detail View ---

  openCard(cardId: string): void {
    this.ui.openCardId = cardId;
    this.emit();
  }

  closeCard(): void {
    this.ui.openCardId = null;
    this.emit();
  }

  // --- UI Layout Toggles ---

  setModalOpen(isOpen: boolean): void {
    this.ui.isModalOpen = isOpen;
    this.emit();
  }

  setWorkspaceSheetOpen(isOpen: boolean): void {
    this.ui.isWorkspaceSheetOpen = isOpen;
    this.emit();
  }

  setSettingsSheetOpen(isOpen: boolean): void {
    this.ui.isSettingsSheetOpen = isOpen;
    this.emit();
  }

  setInputSheetOpen(
    isOpen: boolean,
    mode: "source" | "ask" | "note" = "source",
  ): void {
    this.ui.isInputSheetOpen = isOpen;
    this.ui.inputSheetMode = mode;
    if (isOpen && !this.pendingPipelineResume)
      this.ui.pendingCommandName = mode === "note" ? "" : mode;
    if (!isOpen) this.pendingPipelineResume = null;
    this.emit();
  }

  async submitPendingPipelineInput(
    value: string,
    flags: string[] = [],
  ): Promise<boolean> {
    const resume = this.pendingPipelineResume;
    const command = resume?.command || this.ui.pendingCommandName;
    if (!command || !value.trim()) return false;
    const argument = `${value.trim()}${flags.map((flag) => ` --${flag}`).join("")}`;
    const pipelineText = `${command} "${encodePipelineArgument(argument)}"${resume?.remainingPipeline ? ` | ${resume.remainingPipeline}` : ""}`;
    this.pendingPipelineResume = null;
    return this.runPipeline(
      pipelineText,
      resume
        ? { inputCardIds: resume.inputCardIds, parentId: resume.parentId }
        : undefined,
    );
  }

  setPinEditMode(isEdit: boolean): void {
    this.ui.pinEditMode = isEdit;
    this.emit();
  }

  togglePinCommand(cmdName: string): void {
    const isPinned = this.domain.pinnedCommands.includes(cmdName);
    if (isPinned) {
      this.domain.pinnedCommands = this.domain.pinnedCommands.filter(
        (c) => c !== cmdName,
      );
    } else {
      this.domain.pinnedCommands.push(cmdName);
    }
    this.emit();
  }

  // --- Settings ---

  setTheme(theme: "dark" | "light"): void {
    this.domain.theme = theme;
    this.saveCurrentSettings();
    this.emit();
  }

  setAccent(accent: "teal" | "lilac" | "amber" | "rose" | "arctic"): void {
    this.domain.accent = accent;
    this.saveCurrentSettings();
    this.emit();
  }

  // --- Appearance (palette + typeface customisation) ---

  /** Applies a shipped palette. Clears any accent override so the palette reads as designed. */
  setPalette(paletteId: string): void {
    this.domain.appearance = {
      ...this.domain.appearance,
      paletteId,
      accentOverride: undefined,
    };
    this.saveCurrentSettings();
    this.emit();
  }

  /** Overrides the palette's accent. An invalid hex is ignored by `resolveAppearance`, not guessed at. */
  setAccentOverride(hex: string | undefined): void {
    this.domain.appearance = { ...this.domain.appearance, accentOverride: hex };
    this.saveCurrentSettings();
    this.emit();
  }

  /** Recolours the active palette's neutrals only — never accent/danger/warning/evidence. */
  setSurfaceTint(surfaceTint: SurfaceTint): void {
    this.domain.appearance = { ...this.domain.appearance, surfaceTint };
    this.saveCurrentSettings();
    this.emit();
  }

  setDensity(density: Density): void {
    this.domain.appearance = { ...this.domain.appearance, density };
    this.saveCurrentSettings();
    this.emit();
  }

  setMotionPreference(motion: MotionPreference): void {
    this.domain.appearance = { ...this.domain.appearance, motion };
    this.saveCurrentSettings();
    this.emit();
  }

  setHighContrast(highContrast: boolean): void {
    this.domain.appearance = { ...this.domain.appearance, highContrast };
    this.saveCurrentSettings();
    this.emit();
  }

  /** Chooses which installed (or system) face is used for a role. */
  setFont(role: "mono" | "sans", font: FontChoice): void {
    this.domain.appearance =
      role === "mono"
        ? { ...this.domain.appearance, monoFont: font }
        : { ...this.domain.appearance, sansFont: font };
    this.saveCurrentSettings();
    this.emit();
  }

  /**
   * Runs the font browser's search.
   *
   * Results are ranked locally against a catalog fetched once, so typing is instant after
   * the first query. A stale response is dropped rather than rendered: without the token
   * check, a slow first search could land after a later one and show results for a query
   * the user has already moved on from.
   */
  async searchFonts(
    text: string,
    category: FontCategory | null = this.ui.fontCategory
  ): Promise<void> {
    this.ui.fontQuery = text;
    this.ui.fontCategory = category;
    this.ui.isSearchingFonts = true;
    this.ui.fontCatalogError = null;
    this.emit();

    const token = ++this.fontSearchToken;
    try {
      const results = await this.searchFontsInteractor.execute({ text, category });
      if (token !== this.fontSearchToken) return;
      this.ui.fontResults = results;
    } catch (err: any) {
      if (token !== this.fontSearchToken) return;
      // The browser is unavailable, which is not the same as "nothing matched".
      this.ui.fontResults = [];
      this.ui.fontCatalogError =
        err instanceof UseCaseError ? err.userMessage : "Couldn't load the font catalog";
    } finally {
      if (token === this.fontSearchToken) {
        this.ui.isSearchingFonts = false;
        this.emit();
      }
    }
  }

  /** Narrows the font browser to one category, re-running the current query. */
  async setFontCategory(category: FontCategory | null): Promise<void> {
    await this.searchFonts(this.ui.fontQuery, category);
  }

  /**
   * Loads a family's real typeface so a search result can render in its own face.
   *
   * Deliberately does *not* touch settings: browsing thirty fonts must not install thirty
   * fonts. A family that fails to load is simply never announced as previewable, and the
   * row keeps the system face.
   */
  async previewFont(family: string): Promise<void> {
    if (this.ui.previewedFontFamilies.includes(family)) return;

    const loaded = await this.previewFontInteractor.execute(family);
    if (!loaded) return;
    if (this.ui.previewedFontFamilies.includes(loaded.family)) return;

    this.ui.previewedFontFamilies = [...this.ui.previewedFontFamilies, loaded.family];
    this.emit();
  }

  /**
   * Asks the model to highlight one of a card's existing next-move suggestions.
   *
   * Explicitly invoked — never automatic — because a model call the user didn't ask for
   * is exactly the invisible agent behaviour this app is built to avoid. The chosen
   * action is always one already offered by {@link nextActionsForCard}; the interactor
   * refuses anything else, so this can only ever *highlight*, never add a capability.
   */
  async suggestNextActionFor(card: Card): Promise<void> {
    this.ui.suggestedActionForCardId = card.id;
    this.ui.suggestedActionId = null;
    this.ui.suggestedActionReason = null;
    this.ui.suggestedActionError = null;
    this.ui.isSuggestingNextAction = true;
    this.emit();

    try {
      const { action, reason } = await this.suggestNextActionInteractor.execute(
        card,
        this.domain.openRouterKey,
        this.domain.selectedModel,
        { hasMission: Boolean(this.activeWorkspace()?.mission) },
      );
      // The card may have changed (or the user moved on) while the request was in
      // flight; a stale suggestion landing on a different card would be confusing.
      if (this.ui.suggestedActionForCardId !== card.id) return;
      this.ui.suggestedActionId = action.id;
      this.ui.suggestedActionReason = reason;
    } catch (err: any) {
      if (this.ui.suggestedActionForCardId !== card.id) return;
      this.ui.suggestedActionError =
        err instanceof UseCaseError ? err.userMessage : "Couldn't get a suggestion";
    } finally {
      if (this.ui.suggestedActionForCardId === card.id) {
        this.ui.isSuggestingNextAction = false;
        this.emit();
      }
    }
  }

  /** Clears any pending or shown suggestion, e.g. when the receipt it belonged to closes. */
  clearSuggestedAction(): void {
    this.ui.suggestedActionForCardId = null;
    this.ui.suggestedActionId = null;
    this.ui.suggestedActionReason = null;
    this.ui.suggestedActionError = null;
    this.ui.isSuggestingNextAction = false;
    this.emit();
  }

  /**
   * Downloads a Google font and registers it for use. Only recorded in settings once it
   * has actually loaded — see {@link InstallFontInteractor} — so the font list can never
   * advertise a typeface that won't render.
   */
  async installFont(family: string): Promise<boolean> {
    const trimmed = family.trim();
    if (!trimmed) return false;

    this.ui.isInstallingFont = true;
    this.emit();
    try {
      const font = await this.installFontInteractor.execute(trimmed);
      const existing = this.domain.appearance.installedFonts ?? [];
      const deduped = existing.filter(
        item => item.family.toLowerCase() !== font.family.toLowerCase()
      );
      this.domain.appearance = {
        ...this.domain.appearance,
        installedFonts: [...deduped, font],
      };
      await this.saveCurrentSettings();
      this.showToast(`Installed ${font.family}`);
      return true;
    } catch (err: any) {
      this.showToast(
        err instanceof UseCaseError ? err.userMessage : "Couldn't install that font"
      );
      return false;
    } finally {
      this.ui.isInstallingFont = false;
      this.emit();
    }
  }

  /**
   * Re-registers previously installed fonts at startup, dropping any that no longer load
   * so a dead font degrades to the system face instead of blocking launch.
   */
  private async restoreInstalledFonts(): Promise<void> {
    const installed = this.domain.appearance.installedFonts ?? [];
    if (installed.length === 0) return;

    const loaded = await reloadInstalledFonts(installed, this.fontLoader);
    if (loaded.length === installed.length) return;

    // Some font vanished; forget it and fall back anything that referenced it.
    const survivors = new Set(loaded.map(font => font.family));
    const stillValid = (font: FontChoice | undefined) =>
      font && (font.source === "system" || survivors.has(font.family)) ? font : undefined;

    this.domain.appearance = {
      ...this.domain.appearance,
      installedFonts: loaded,
      monoFont: stillValid(this.domain.appearance.monoFont),
      sansFont: stillValid(this.domain.appearance.sansFont),
    };
    await this.saveCurrentSettings();
    this.emit();
  }

  setOpenRouterKey(key: string): void {
    this.domain.openRouterKey = key;
    this.saveCurrentSettings();
    this.emit();
  }

  setSelectedModel(model: string): void {
    this.domain.selectedModel = model;
    this.saveCurrentSettings();
    this.emit();
  }

  setCustomSystemPrompt(prompt: string): void {
    this.domain.customSystemPrompt = prompt;
    this.saveCurrentSettings();
    this.emit();
  }

  setCustomChunkSystemPrompt(prompt: string): void {
    this.domain.customChunkSystemPrompt = prompt;
    this.saveCurrentSettings();
    this.emit();
  }

  setAutoGroupByCommand(enabled: boolean): void {
    this.domain.autoGroupByCommand = enabled;
    this.saveCurrentSettings();
    this.emit();
  }

  setInterleaveReviews(enabled: boolean): void {
    this.domain.interleaveReviews = enabled;
    this.saveCurrentSettings();
    this.emit();
  }

  async updateSearchSiteFlags(flags: Record<string, string>): Promise<void> {
    this.domain.searchSiteFlags = flags;
    this.emit();
    await this.saveCurrentSettings();
  }

  // --- Group Navigation (drill-in) ---

  /** Drills into a group so the canvas shows that group's children. */
  openGroup(groupId: string): void {
    this.domain.currentGroupId = groupId;
    this.emit();
  }

  /**
   * Navigates to an arbitrary point in the breadcrumb trail; pass null for the
   * workspace root.
   */
  navigateToGroup(groupId: string | null): void {
    this.domain.currentGroupId = groupId;
    this.emit();
  }

  /** Takes the user to what the last run produced. */
  async openOperationResult(): Promise<void> {
    await this.operations.openResult();
  }

  dismissOperationResult(): void {
    this.operations.dismissResult();
    // The suggestion belongs to the receipt it appeared on; it shouldn't outlive it.
    this.clearSuggestedAction();
  }

  /** Reverses the most recent run, or explains why it can't. */
  async undoLastOperation(): Promise<boolean> {
    return this.operations.undoLast();
  }

  /**
   * The single entry point for every suggested action — capture-receipt follow-ups and
   * selection-tray buttons alike (see `nextActions.ts` / `selectionActions.ts`).
   *
   * Routing lives here rather than in each component so the guarantee is enforced in one
   * place: a `preflight` dispatch can only ever *open the scope sheet*. There is no code
   * path by which tapping a suggestion reaches a gateway directly.
   */
  async dispatchSuggestedAction(dispatch: SuggestedActionDispatch): Promise<void> {
    switch (dispatch.kind) {
      case "preflight":
        this.operations.dismissResult();
        this.openPreflight(dispatch.presetId);
        return;
      case "pipeline":
        this.operations.dismissResult();
        this.emit();
        await this.runPipeline(dispatch.text);
        return;
      case "mission":
        this.operations.dismissResult();
        this.openMissionEditor();
        return;
      case "goal":
        this.operations.dismissResult();
        this.ui.isModalOpen = false;
        this.openGoalArchitect();
        return;
      case "palette":
        this.operations.dismissResult();
        this.setModalOpen(true);
        return;
      case "status":
        this.operations.dismissResult();
        this.ui.isModalOpen = false;
        this.openGapReport();
        return;
      case "capture":
        // Capture is a screen, not a sheet, so the controller only clears what's in the
        // way; MainLayout observes `captureIntent` and does the navigation.
        this.operations.dismissResult();
        this.ui.isModalOpen = false;
        this.ui.captureIntent = dispatch.intent;
        this.emit();
        return;
    }
  }

  /** Consumes the pending group navigation, so the shell moves there exactly once. */
  consumeGroupNavigation(): string | null {
    const groupId = this.ui.pendingGroupNavigation;
    if (groupId) {
      this.ui.pendingGroupNavigation = null;
      this.emit();
    }
    return groupId;
  }

  /** Consumes the pending capture intent, so navigating to the capture screen happens once. */
  consumeCaptureIntent(): "note" | "paste" | "link" | "ask" | null {
    const intent = this.ui.captureIntent;
    if (intent) {
      this.ui.captureIntent = null;
      this.emit();
    }
    return intent;
  }

  // --- Custom Commands ---

  /**
   * Rebuilds the pipeline's command set from the built-ins plus the custom command
   * definitions visible from the active workspace. Called whenever definitions are
   * loaded or change, and whenever the active workspace changes — a workspace-scoped
   * command must not still be runnable after switching away from where it belongs.
   */
  private rebuildPipeline(): void {
    const visible = this.domain.commandDefinitions.filter((definition) =>
      isCommandVisibleInWorkspace(definition, this.domain.activeWorkspaceId),
    );
    this.pipeline = this.commandRegistry.rebuild(visible);
  }

  /** Defines and registers a new custom command, then makes it usable immediately. */
  async createCustomCommand(
    request: CreateCommandDefinitionRequest,
  ): Promise<void> {
    try {
      const definition =
        await this.createCommandDefinitionInteractor.execute(request);
      this.domain.commandDefinitions.push(definition);
      this.rebuildPipeline();
      this.ui.isInputSheetOpen = false;
      this.showToast(`Created command: ${definition.name}`);
      this.logger.debug("customCommand.created", { name: definition.name });
    } catch (err: any) {
      this.logger.error("customCommand.createFailed", err);
      this.showToast(
        err instanceof UseCaseError
          ? err.userMessage
          : "Could not create command",
      );
    }
  }

  /** Removes a custom command and unregisters it from the pipeline. */
  async deleteCustomCommand(id: string): Promise<void> {
    await this.deleteCommandDefinitionInteractor.execute(id);
    const removed = this.domain.commandDefinitions.find((d) => d.id === id);
    this.domain.commandDefinitions = this.domain.commandDefinitions.filter(
      (d) => d.id !== id,
    );
    this.domain.pinnedCommands = this.domain.pinnedCommands.filter(
      (c) => c !== removed?.name,
    );
    this.rebuildPipeline();
    this.emit();
    this.showToast("Command deleted");
  }

  // --- Card Types (modular registry) ---

  /**
   * Loads the persisted card type registry, seeding the built-in definitions on the
   * very first run so every card always resolves its type. Restyled built-ins and
   * custom types take precedence over the seeds once saved.
   */
  private async loadCardTypes(): Promise<CardTypeDefinition[]> {
    const stored = await this.cardTypeRepo.getTypes();
    if (stored.length === 0) {
      for (const def of BUILTIN_CARD_TYPES) {
        await this.cardTypeRepo.saveType(def);
      }
      return [...BUILTIN_CARD_TYPES];
    }
    // Backfill any built-ins missing from an older store (forward compatibility).
    const byId = new Map(stored.map((t) => [t.id, t]));
    for (const def of BUILTIN_CARD_TYPES) {
      if (!byId.has(def.id)) {
        await this.cardTypeRepo.saveType(def);
        byId.set(def.id, def);
      }
    }
    return Array.from(byId.values());
  }

  /** Defines and registers a new custom card type. */
  async createCardType(request: CreateCardTypeRequest): Promise<void> {
    try {
      const definition = await this.createCardTypeInteractor.execute(request);
      this.domain.cardTypes = [...this.domain.cardTypes, definition];
      this.showToast(`Created card type: ${definition.name}`);
    } catch (err: any) {
      this.showToast(
        err instanceof UseCaseError
          ? err.userMessage
          : "Could not create card type",
      );
    }
  }

  /** Restyles/updates an existing card type (built-in or custom). */
  async updateCardType(definition: CardTypeDefinition): Promise<void> {
    await this.cardTypeRepo.saveType(definition);
    this.domain.cardTypes = this.domain.cardTypes.map((t) =>
      t.id === definition.id ? definition : t,
    );
    this.emit();
  }

  /** Removes a custom card type (built-ins are protected). */
  async deleteCardType(id: string): Promise<void> {
    try {
      const workspaceCards = await Promise.all(
        this.domain.workspaces.map((workspace) =>
          this.cardRepo.getCardsByWorkspace(workspace.id),
        ),
      );
      if (
        workspaceCards
          .flat()
          .some((card) => (card.typeId ?? card.type) === id)
      ) {
        this.showToast("Reassign cards before deleting this type");
        return;
      }
      await this.deleteCardTypeInteractor.execute(id);
      this.domain.cardTypes = this.domain.cardTypes.filter((t) => t.id !== id);
      this.emit();
      this.showToast("Card type deleted");
    } catch (err: any) {
      this.showToast(
        err instanceof UseCaseError
          ? err.userMessage
          : "Could not delete card type",
      );
    }
  }

  // --- Prompt Presets (extendable card-generation instructions) ---

  /** Loads persisted presets, seeding the built-ins on first run and backfilling new ones. */
  private async loadPromptPresets(): Promise<PromptPreset[]> {
    const stored = await this.promptPresetRepo.getPresets();
    if (stored.length === 0) {
      for (const p of BUILTIN_PROMPT_PRESETS)
        await this.promptPresetRepo.savePreset(p);
      return [...BUILTIN_PROMPT_PRESETS];
    }
    const byId = new Map(stored.map((p) => [p.id, p]));
    for (const p of BUILTIN_PROMPT_PRESETS) {
      if (!byId.has(p.id)) {
        await this.promptPresetRepo.savePreset(p);
        byId.set(p.id, p);
      }
    }
    return Array.from(byId.values());
  }

  /** Applies a preset's instruction as the active agent + chunk system prompt. */
  applyPromptPreset(id: string): void {
    const preset = this.domain.promptPresets.find((p) => p.id === id);
    if (!preset) return;
    this.domain.customSystemPrompt = preset.prompt;
    this.domain.customChunkSystemPrompt = preset.prompt;
    this.saveCurrentSettings();
    this.emit();
    this.showToast(`Applied preset: ${preset.name}`);
  }

  /** Saves the current system prompt as a new named, reusable preset. */
  async saveCurrentAsPreset(name: string): Promise<void> {
    const preset = createPromptPreset({
      name,
      prompt: this.domain.customSystemPrompt,
    });
    await this.promptPresetRepo.savePreset(preset);
    this.domain.promptPresets = [...this.domain.promptPresets, preset];
    this.emit();
    this.showToast(`Saved preset: ${preset.name}`);
  }

  /** Removes a user-defined preset (built-ins are protected). */
  async deletePromptPreset(id: string): Promise<void> {
    const preset = this.domain.promptPresets.find((p) => p.id === id);
    if (!preset || preset.builtin) {
      this.showToast("Built-in presets can't be deleted");
      return;
    }
    await this.promptPresetRepo.deletePreset(id);
    this.domain.promptPresets = this.domain.promptPresets.filter(
      (p) => p.id !== id,
    );
    this.emit();
    this.showToast("Preset deleted");
  }

  // --- Card Deletion ---

  /**
   * Permanently deletes a card. Non-groups (and groups by default) promote any
   * children up a level; pass `recursive` to delete a group and its entire contents.
   */
  async deleteCard(cardId: string, recursive: boolean = false): Promise<void> {
    const card = this.domain.cards.find((c) => c.id === cardId);
    if (!card) return;

    await this.deleteCardInteractor.execute(card, recursive);

    // If we were viewing the group we just deleted, step up to its parent.
    if (this.domain.currentGroupId === cardId) {
      this.domain.currentGroupId = card.parentId ?? null;
    }
    this.domain.selection.delete(cardId);
    this.ui.openCardId = null;
    await this.loadCardsForActiveWorkspace();
    this.emit();
    this.showToast("Card deleted");
    this.logger.debug("card.deleted", { cardId });
  }

  /**
   * Persists a value into one of a card's schema-defined fields (e.g. the learner's
   * own write-up on an elaboration card). Generic over any field key so custom card
   * types work without bespoke methods.
   */
  async setCardField(
    cardId: string,
    key: string,
    value: string,
  ): Promise<void> {
    const card = this.domain.cards.find((c) => c.id === cardId);
    if (!card) return;
    const updated: Card = {
      ...card,
      fields: { ...(card.fields || {}), [key]: value },
    };
    await this.cardRepo.saveCard(updated);
    this.domain.cards = this.domain.cards.map((c) =>
      c.id === cardId ? updated : c,
    );
    this.review.applyCardUpdate(updated);
    this.emit();
  }

  /**
   * Renames a card in place.
   *
   * The one field capture explicitly asks the user for rather than deriving from
   * content — a title generated from the first line of a note or the raw text of a
   * question is a guess, and this is how the guess gets corrected. Blank input is a
   * no-op rather than clearing the title: an empty title is never an improvement.
   */
  async setCardTitle(cardId: string, title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) return;
    const card = this.domain.cards.find((c) => c.id === cardId);
    if (!card || card.title === trimmed) return;
    const updated: Card = { ...card, title: trimmed };
    await this.cardRepo.saveCard(updated);
    this.domain.cards = this.domain.cards.map((c) => (c.id === cardId ? updated : c));
    this.review.applyCardUpdate(updated);
    this.emit();
  }

  /** Re-assigns a card's modular type (e.g. to make it render as interactive HTML). */
  async setCardType(cardId: string, typeId: string): Promise<void> {
    const card = this.domain.cards.find((c) => c.id === cardId);
    if (!card) return;
    const fieldKeys = new Set(
      this.domain.cardTypes.find((type) => type.id === typeId)?.fields.map(
        (field) => field.key,
      ) ?? [],
    );
    const fields = Object.fromEntries(
      Object.entries(card.fields ?? {}).filter(([key]) => fieldKeys.has(key)),
    );
    const updated: Card = {
      ...card,
      typeId,
      fields: Object.keys(fields).length ? fields : undefined,
    };
    await this.cardRepo.saveCard(updated);
    this.domain.cards = this.domain.cards.map((c) =>
      c.id === cardId ? updated : c,
    );
    this.emit();
  }

  /** Edits a card's body text (used by the in-card HTML/content editor). */
  async setCardBody(cardId: string, body: string): Promise<void> {
    const card = this.domain.cards.find((c) => c.id === cardId);
    if (!card) return;
    const updated: Card = { ...card, body };
    await this.cardRepo.saveCard(updated);
    this.domain.cards = this.domain.cards.map((c) =>
      c.id === cardId ? updated : c,
    );
    this.emit();
  }

  // --- Chat (streamed, group-aware) ---

  /** Parses a chat card's body into its message list (empty on any malformed body). */
  private parseChat(body: string): ChatMessage[] {
    try {
      const parsed = JSON.parse(body || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** Writes the message list back into the chat card (in-memory + persisted). */
  private async writeChat(
    cardId: string,
    messages: ChatMessage[],
    persist: boolean,
  ): Promise<void> {
    const card = this.domain.cards.find((c) => c.id === cardId);
    if (!card) return;
    const updated: Card = { ...card, body: JSON.stringify(messages) };
    this.domain.cards = this.domain.cards.map((c) =>
      c.id === cardId ? updated : c,
    );
    if (persist) await this.cardRepo.saveCard(updated);
    this.emit();
  }

  /**
   * Builds the system context for a chat card from the workspace name and the other
   * cards in the same group, so the agent answers grounded in what the user is studying.
   */
  private buildChatContext(card: Card): string {
    const ws = this.domain.workspaces.find(
      (w) => w.id === this.domain.activeWorkspaceId,
    );
    const groupCards = this.domain.cards.filter(
      (c) =>
        c.parentId === card.parentId &&
        c.id !== card.id &&
        c.type !== "group" &&
        c.type !== "chat",
    );
    const cardList =
      groupCards.length > 0
        ? groupCards
            .map(
              (c) =>
                `- ${c.title}: ${(c.body || c.answer || "").substring(0, 400)}`,
            )
            .join("\n")
        : "(no other cards in this group yet)";
    return `You are a focused study tutor helping the user learn. They are in the workspace "${ws?.name ?? "Untitled"}". Use the following cards from the current group as the primary context for your answers; be accurate and concise, and say when something isn't covered by them.\n\nCards in context:\n${cardList}`;
  }

  /**
   * Sends a user message in a chat card and streams the agent's reply token-by-token,
   * updating the card live. The group's cards + workspace name are supplied as context.
   */
  async sendChatMessage(cardId: string, userText: string): Promise<boolean> {
    const text = userText.trim();
    if (!text) return false;
    if (this.ui.chatStreamingCardId) return false;
    const card = this.domain.cards.find((c) => c.id === cardId);
    if (!card) return false;

    if (!this.agentGateway.streamChat) {
      this.showToast("This model gateway can't stream chat");
      return false;
    }
    if (!this.domain.openRouterKey?.trim()) {
      this.showToast("Add your OpenRouter key in Settings");
      return false;
    }

    const history = this.parseChat(card.body);
    history.push({ role: "user", content: text });
    history.push({ role: "assistant", content: "" });
    const assistantIdx = history.length - 1;
    this.ui.chatStreamingCardId = cardId;
    this.emit();

    const requestMessages: ChatMessage[] = [
      {
        role: "system",
        content: `${
          resolveAssistantProfile(
            "chat",
            this.domain.activeProfileIds,
            this.domain.assistantProfiles,
          ).systemPrompt
        }\n\n${this.buildChatContext(card)}`,
      },
      ...history.slice(0, assistantIdx), // everything up to (not incl.) the empty assistant
    ];

    try {
      await this.writeChat(cardId, history, true);
      await this.agentGateway.streamChat(
        requestMessages,
        this.domain.openRouterKey,
        this.domain.selectedModel,
        (delta) => {
          history[assistantIdx].content += delta;
          // Update in-memory + emit for a live feed; persistence happens once at the end.
          void this.writeChat(cardId, history, false);
        },
      );
      await this.writeChat(cardId, history, true);
    } catch (err: any) {
      history[assistantIdx].content +=
        `\n\n_[error: ${err?.message || "stream failed"}]_`;
      await this.writeChat(cardId, history, true);
      this.showToast("Chat failed");
    } finally {
      this.ui.chatStreamingCardId = null;
      this.emit();
    }
    return true;
  }

  // --- Search & Extraction ---

  async extractUrlToCard(
    url: string,
    title: string,
    parentId?: string,
    sourceCardIdForGrouping?: string,
  ): Promise<void> {
    const workspaceId = this.domain.activeWorkspaceId;
    if (!workspaceId) return;

    const opId = this.addPendingOperation(`Extracting ${url}...`);

    try {
      let finalParentId = parentId || this.domain.currentGroupId || undefined;

      const card = await this.extractUrlInteractor.execute({
        url,
        title,
        workspaceId,
        parentId: finalParentId,
      });

      // If requested to group with the source article, and no parent group exists yet, create one!
      if (sourceCardIdForGrouping && !finalParentId) {
        const sourceCard = this.domain.cards.find(
          (c) => c.id === sourceCardIdForGrouping,
        );
        if (sourceCard) {
          const group = await this.groupCardsInteractor.execute({
            workspaceId,
            parentId: sourceCard.parentId || null,
            name: "Related Sources",
            cards: [sourceCard, card],
          });
          finalParentId = group.id;
        }
      }

      this.domain.selection = new Set([card.id]);
      await this.loadCardsForActiveWorkspace();
      this.removePendingOperation(opId);
      this.showToast(
        finalParentId ? "Extracted to related group" : "Extracted to new card",
      );
      this.logger.debug("url.extracted", { cardId: card.id });
    } catch (err: any) {
      this.logger.error("url.extractFailed", err);
      this.setPendingOperationError(opId, `Failed to extract: ${err.message}`);
      this.showToast(`Extraction failed: ${err.message}`);
    }
  }

  private currentSettings(): AppSettings {
    return {
      theme: this.domain.theme,
      accent: this.domain.accent,
      appearance: this.domain.appearance,
      openRouterKey: this.domain.openRouterKey,
      selectedModel: this.domain.selectedModel,
      customSystemPrompt: this.domain.customSystemPrompt,
      customChunkSystemPrompt: this.domain.customChunkSystemPrompt,
      activeProfileIds: this.domain.activeProfileIds,
      autoGroupByCommand: this.domain.autoGroupByCommand,
      interleaveReviews: this.domain.interleaveReviews,
      searchSiteFlags: this.domain.searchSiteFlags,
    };
  }

  private async saveCurrentSettings(): Promise<void> {
    try {
      await this.saveSettingsInteractor.execute(this.currentSettings());
      this.logger.debug("settings.saved");
    } catch (err: any) {
      // Settings that look saved but aren't are how a user loses an API key without
      // noticing, so this failure is reported rather than only logged.
      this.logger.error("settings.saveFailed", err);
      this.showToast("Could not save your settings");
    }
  }

  // --- Workspace CRUD ---

  async createNewWorkspace(name: string): Promise<void> {
    const ws = await this.createWorkspaceInteractor.execute(name);
    this.domain.workspaces.push(ws);
    this.domain.activeWorkspaceId = ws.id;
    this.domain.currentGroupId = null;
    this.domain.selection.clear();
    this.ui.isWorkspaceSheetOpen = false;
    await this.loadCardsForActiveWorkspace();
    this.showToast(`Created workspace: ${ws.name}`);
  }

  async switchWorkspace(workspaceId: string): Promise<void> {
    const loadToken = ++this.workspaceLoadToken;
    this.domain.activeWorkspaceId = workspaceId;
    this.domain.currentGroupId = null;
    this.domain.selection.clear();
    this.ui.isWorkspaceSheetOpen = false;
    this.domain.cards = [];
    // A workspace-scoped command from the space just left must stop being runnable here.
    this.rebuildPipeline();
    this.emit();
    const cards = await this.switchWorkspaceInteractor.execute(workspaceId);
    if (
      loadToken !== this.workspaceLoadToken ||
      this.domain.activeWorkspaceId !== workspaceId
    )
      return;
    this.domain.cards = cards;
    this.emit();
  }

  async deleteActiveWorkspace(): Promise<void> {
    if (!this.domain.activeWorkspaceId) return;
    const toDeleteId = this.domain.activeWorkspaceId;

    await this.deleteWorkspaceInteractor.execute(toDeleteId);
    this.domain.workspaces = this.domain.workspaces.filter(
      (w) => w.id !== toDeleteId,
    );
    this.domain.currentGroupId = null;

    if (this.domain.workspaces.length > 0) {
      this.domain.activeWorkspaceId = this.domain.workspaces[0].id;
      await this.loadCardsForActiveWorkspace();
    } else {
      const defaultWs =
        await this.createWorkspaceInteractor.execute("My Workspace");
      this.domain.workspaces.push(defaultWs);
      this.domain.activeWorkspaceId = defaultWs.id;
      await this.loadCardsForActiveWorkspace();
    }
    this.emit();
    this.showToast("Workspace deleted");
  }

  // --- Pipeline Flow ---

  /**
   * Executes a Unix-like pipeline where the output of one command is piped as input
   * to the next, delegating parsing and execution to the {@link PipelineRunner}.
   *
   * @param pipelineText A pipeline string (e.g., 'ask "React" | chunk | recall | space')
   */
  public async runPipeline(
    pipelineText: string,
    retry?: { inputCardIds: string[]; parentId: string | null },
  ): Promise<boolean> {
    const startedAt = Date.now();
    this.logger.debug("pipeline.run", { pipelineText });

    const workspaceId = this.domain.activeWorkspaceId;
    if (!workspaceId) {
      this.showToast("Create a workspace first");
      return false;
    }

    // A bare `/alias` is a shortcut to a canonical action's sheet, not a pipeline stage.
    // Resolved here rather than in the palette so typing it into the command line, a
    // macro, or the capture terminal all behave identically.
    const alias = resolveCommandAlias(pipelineText);
    if (alias) {
      await this.dispatchSuggestedAction(alias.dispatch);
      return true;
    }

    this.dismissTransientSheets();
    this.pendingPipelineResume = null;
    this.emit();

    const { targetParentId, initialInputCards } = this.resolvePipelineInputs(retry);

    const opId = this.addPendingOperation(pipelineText, {
      pipelineText,
      inputCardIds: initialInputCards.map((c) => c.id),
      parentId: targetParentId,
    });

    try {
      const outcome = await this.pipeline.run(pipelineText, {
        workspaceId,
        parentId: targetParentId,
        initialInputCards,
        workspaces: this.domain.workspaces,
        apiKey: this.domain.openRouterKey,
        model: this.domain.selectedModel,
        systemPrompt: this.domain.customSystemPrompt,
        chunkSystemPrompt: this.domain.customChunkSystemPrompt,
        assistantProfiles: this.domain.assistantProfiles,
        activeProfileIds: this.domain.activeProfileIds,
        cardTypes: this.domain.cardTypes,
        autoGroup: this.domain.autoGroupByCommand,
      });

      this.removePendingOperation(opId);

      if (outcome.kind === "needsInput") {
        await this.pausePipelineForInput(outcome, workspaceId, targetParentId);
        return false;
      }
      if (outcome.kind === "review") {
        this.startReview();
        return true;
      }
      if (outcome.kind === "goal") {
        this.openGoalArchitect();
        return true;
      }

      const pendingRecord =
        outcome.cards.length > 0
          ? await this.settleRunOutput(outcome.cards, {
              pipelineText,
              workspaceId,
              targetParentId,
              startedAt,
            })
          : null;

      if (this.domain.activeWorkspaceId === workspaceId) {
        this.domain.selection = new Set(outcome.cards.map((c) => c.id));
        await this.loadCardsForActiveWorkspace();
      }

      if (pendingRecord) {
        // Snapshotted *after* the reload, so they reflect the cards as they finally
        // landed — auto-grouping re-parents the output, and a snapshot taken before that
        // would look like a user edit to `canUndoCreate` and wrongly block the undo.
        const settled = this.domain.cards.filter((card) =>
          pendingRecord!.createdCardIds.includes(card.id),
        );
        await this.operations.recordCompletedRun({
          commandName: pipelineText,
          workspaceId,
          parentId: pendingRecord.destinationGroupId,
          inputCardIds: initialInputCards.map((card) => card.id),
          createdCards: settled,
          startedAt,
          summary: pendingRecord.summary,
        });
      }
      this.emit();
      return true;
    } catch (error) {
      await this.recordPipelineFailure(error, {
        operationId: opId,
        pipelineText,
        workspaceId,
        targetParentId,
        inputCardIds: initialInputCards.map((card) => card.id),
      });
      return false;
    }
  }

  /**
   * Resolves what a run reads and where it writes. A retry restores the *original*
   * selection and group rather than whatever is selected now; a fresh run expands the
   * current selection, so piping a group feeds its descendants.
   */
  private resolvePipelineInputs(retry?: {
    inputCardIds: string[];
    parentId: string | null;
  }): { targetParentId: string | null; initialInputCards: Card[] } {
    if (retry) {
      return {
        targetParentId: retry.parentId,
        initialInputCards: this.domain.cards.filter((card) =>
          retry.inputCardIds.includes(card.id),
        ),
      };
    }
    return {
      targetParentId: this.domain.currentGroupId,
      initialInputCards: expandForPipe(this.domain.cards, this.domain.selection),
    };
  }

  /**
   * A stage asked the user for something. The rest of the pipeline is parked verbatim so
   * `submitPendingPipelineInput` can resume exactly where it stopped.
   */
  private async pausePipelineForInput(
    outcome: Extract<PipelineOutcome, { kind: "needsInput" }>,
    workspaceId: string,
    targetParentId: string | null,
  ): Promise<void> {
    this.ui.pendingCommandName = outcome.command;
    if (outcome.resume) {
      if (this.domain.activeWorkspaceId === workspaceId) {
        await this.loadCardsForActiveWorkspace();
      }
      this.pendingPipelineResume = {
        command: outcome.resume.command,
        remainingPipeline: outcome.resume.remainingPipeline,
        inputCardIds: outcome.resume.inputCards.map((card) => card.id),
        parentId: targetParentId,
      };
    }
    this.setInputSheetOpen(true, outcome.mode);
  }

  /**
   * Gives a run's output a home and a receipt: groups it when the rules say so (see
   * `runOutcome.ts`), moves the user to it, and returns what an undo record will need.
   */
  private async settleRunOutput(
    cards: Card[],
    run: {
      pipelineText: string;
      workspaceId: string;
      targetParentId: string | null;
      startedAt: number;
    },
  ): Promise<PendingRunRecord> {
    let destinationGroupId = commonParentId(cards) ?? run.targetParentId ?? undefined;
    let createdGroupId: string | undefined;

    if (
      shouldAutoGroup({
        cards,
        startedAt: run.startedAt,
        autoGroupEnabled: this.domain.autoGroupByCommand,
      })
    ) {
      const group = await this.groupCardsInteractor.execute({
        workspaceId: run.workspaceId,
        parentId: cards[0].parentId ?? run.targetParentId,
        name: `${commandNameOf(run.pipelineText)} output`,
        cards,
      });
      destinationGroupId = group.id;
      createdGroupId = group.id;
      // Move the user into the group the work just produced, so the result is what
      // they're looking at rather than something they have to go find.
      this.domain.currentGroupId = group.id;
      this.ui.pendingGroupNavigation = group.id;
    }

    const summary = describeRunOutput(cards);
    this.operations.present({
      summary,
      createdCardIds: cards.map((card) => card.id),
      destination: {
        spaceId: run.workspaceId,
        groupId: destinationGroupId,
        cardId: cards.length === 1 ? cards[0].id : undefined,
      },
      primaryActionLabel: destinationGroupId ? "Open document" : "Open result",
    });

    return {
      // The group a run creates is part of what it created, so undoing removes it too.
      createdCardIds: [
        ...cards.map((card) => card.id),
        ...(createdGroupId ? [createdGroupId] : []),
      ],
      summary,
      destinationGroupId,
    };
  }

  /**
   * Turns a failed run into a card rather than a banner: it lands where the output would
   * have gone, survives navigation and restart, and carries everything needed to retry.
   */
  private async recordPipelineFailure(
    error: unknown,
    run: {
      operationId: string;
      pipelineText: string;
      workspaceId: string;
      targetParentId: string | null;
      inputCardIds: string[];
    },
  ): Promise<void> {
    this.logger.error("pipeline.failed", error);
    const errorMessage =
      error instanceof UseCaseError ? error.userMessage : "Pipeline failed";

    // Clear the transient operation first, so the same failure isn't reported twice.
    this.removePendingOperation(run.operationId);
    await this.cardRepo.saveCard(
      createFailedRunCard({
        workspaceId: run.workspaceId,
        pipelineText: run.pipelineText,
        inputCardIds: run.inputCardIds,
        parentId: run.targetParentId,
        errorMessage,
        failedAt: Date.now(),
      }),
    );
    if (this.domain.activeWorkspaceId === run.workspaceId) {
      await this.loadCardsForActiveWorkspace();
    }
    this.showToast(errorMessage);
    this.emit();
  }

  /**
   * Re-runs the operation a failure card recorded, using the *original* inputs rather
   * than whatever happens to be selected now — a retry that quietly changes its input is
   * a different operation wearing the same label.
   *
   * The card is removed only after the retry succeeds, so a second failure leaves exactly
   * one record rather than accumulating a pile of them.
   */
  async rerunFailedCard(cardId: string): Promise<boolean> {
    const card = this.domain.cards.find((c) => c.id === cardId);
    if (!card) return false;

    const details = readFailedRunCard(card);
    if (!details) {
      this.showToast("This failure can't be retried — its details are incomplete");
      return false;
    }

    this.ui.openCardId = null;
    this.emit();

    const succeeded = await this.runPipeline(details.pipelineText, {
      inputCardIds: details.inputCardIds,
      parentId: details.parentId,
    });

    if (succeeded) {
      await this.cardRepo.deleteCard(cardId);
      await this.loadCardsForActiveWorkspace();
      this.emit();
    }
    return succeeded;
  }

  /**
   * Closes every sheet that was a step *toward* an action, the moment that action starts.
   *
   * These surfaces exist to compose a command; once it's running they're stale, and any
   * one of them left up is a form the user already submitted still sitting on screen.
   * Centralised here because the bug was per-sheet: each caller remembered to close its
   * own and forgot the others. Progress belongs to the ActivityBanner, which is always
   * visible, so nothing is lost by dismissing all of them.
   */
  private dismissTransientSheets(): void {
    this.ui.isModalOpen = false;
    this.ui.isInputSheetOpen = false;
    this.ui.activePreflightPresetId = null;
    this.ui.preflightQuery = "";
    this.ui.aiQuerySuggestions = [];
    this.mission.closeGapReport();
  }

  public addPendingOperation(
    commandName: string,
    retry?: {
      pipelineText: string;
      inputCardIds: string[];
      parentId: string | null;
    },
  ): string {
    return this.operations.begin(commandName, retry);
  }

  /**
   * Re-runs a failed pipeline operation, restoring the exact selection and group it
   * originally ran against so the retry is faithful (not dependent on whatever is
   * selected now).
   */
  async retryPipeline(opId: string): Promise<void> {
    const op = this.operations.find(opId);
    if (!op) return;
    if (!op.pipelineText) {
      this.showToast("This operation must be started again from its source");
      return;
    }
    if (op.workspaceId && op.workspaceId !== this.domain.activeWorkspaceId) {
      await this.switchWorkspace(op.workspaceId);
      if (this.domain.activeWorkspaceId !== op.workspaceId) return;
    }
    const text = op.pipelineText;
    const retry =
      op.inputCardIds !== undefined
        ? { inputCardIds: op.inputCardIds, parentId: op.parentId ?? null }
        : undefined;
    this.removePendingOperation(opId);
    await this.runPipeline(text, retry);
  }

  public setPendingOperationError(id: string, errorMessage: string): void {
    this.operations.fail(id, errorMessage);
  }

  public removePendingOperation(id: string): void {
    this.operations.end(id);
  }

  // --- AI Preflight (explicit scope before every AI/web operation) ---

  /**
   * Opens the preflight sheet for a named operation preset (see `operationPresets.ts`).
   * The sheet itself is rendered by presenting the current state through
   * `presentAgentPreflight` — this only tracks which preset is open and its query text.
   */
  openPreflight(presetId: string, initialQuery?: string): void {
    if (!findOperationPreset(presetId)) return;
    this.ui.activePreflightPresetId = presetId;
    this.ui.preflightQuery = initialQuery ?? "";
    this.ui.aiQuerySuggestions = [];
    this.emit();
  }

  closePreflight(): void {
    this.ui.activePreflightPresetId = null;
    this.ui.preflightQuery = "";
    this.ui.aiQuerySuggestions = [];
    this.emit();
  }

  /**
   * The optional, explicit "break this down for me" step ahead of research: calls the
   * model once (via `SuggestSearchQueriesInteractor`) to turn a broad topic into several
   * sharper search queries, shown as additional tappable suggestions in the preflight.
   * A distinct AI call from the actual web search — never implies browsing happened.
   */
  async suggestSearchQueries(topic: string): Promise<void> {
    const trimmed = topic.trim();
    if (!trimmed) {
      this.showToast("Type a topic first, then suggest queries");
      return;
    }
    if (!this.domain.openRouterKey?.trim()) {
      this.showToast("Add your OpenRouter key in Settings");
      return;
    }

    this.ui.isSuggestingQueries = true;
    this.emit();
    try {
      const queries = await this.suggestSearchQueriesInteractor.execute({
        topic: trimmed,
        mission: this.activeWorkspace()?.mission,
        apiKey: this.domain.openRouterKey,
        model: this.domain.selectedModel,
      });
      this.ui.aiQuerySuggestions = queries;
    } catch (err: any) {
      this.showToast(
        err instanceof UseCaseError ? err.userMessage : "Could not suggest queries",
      );
    } finally {
      this.ui.isSuggestingQueries = false;
      this.emit();
    }
  }

  setPreflightQuery(query: string): void {
    this.ui.preflightQuery = query;
    this.emit();
  }

  /**
   * Dispatches the open preflight's operation through the existing pipeline commands
   * (`ask`/`search`/`recall`) — never a parallel execution path. Uses `runPipeline`'s
   * existing `retry` hook to feed exactly the preset's resolved bounded context as
   * input, regardless of what's currently selected, so "workspace" scope can include
   * breadcrumb/sibling cards without mutating the user's visible selection first.
   */
  async confirmPreflight(): Promise<boolean> {
    const presetId = this.ui.activePreflightPresetId;
    const preset = presetId ? findOperationPreset(presetId) : undefined;
    if (!preset) return false;

    const query = this.ui.preflightQuery;

    if (preset.command === "research") {
      this.ui.activePreflightPresetId = null;
      this.ui.preflightQuery = "";
      this.ui.aiQuerySuggestions = [];
      this.emit();
      await this.startResearch(query);
      return true;
    }

    const selectedCards = expandForPipe(this.domain.cards, this.domain.selection);
    const request = buildAgentRunRequest({
      preset,
      workspaceId: this.domain.activeWorkspaceId ?? "",
      parentId: this.domain.currentGroupId,
      allCards: this.domain.cards,
      selectedCards,
      query,
    });

    const pipelineText = buildPipelineText(preset, query);

    // Dismiss on commit, not on completion. The sheet's job ends the moment the user
    // says "run it" — keeping it up through the work leaves them staring at a form they
    // already submitted, and closing only on success left it stranded forever on
    // failure. Progress is the ActivityBanner's job; failure becomes a card.
    return this.runPipeline(pipelineText, {
      inputCardIds: request.contextCardIds,
      parentId: this.domain.currentGroupId,
    });
  }

  // --- Web Research Flow (delegated to ResearchWorkflow) ---
  //
  // These stay on the controller because the UI talks to one object, but they are now
  // pure delegation: the search/keep/cite state machine lives in the use-case layer.

  /** Runs a real web search and opens the sheet with inspectable candidates. */
  async startResearch(query: string): Promise<void> {
    await this.research.start(query);
  }

  /** Marks a research candidate kept or rejected (or resets it to undecided). */
  setResearchKeepState(url: string, keepState: ResearchResult["keepState"]): void {
    this.research.setKeepState(url, keepState);
  }

  /** Fetches a candidate's full text; failure is surfaced, never fabricated. */
  async extractResearchResult(url: string): Promise<void> {
    await this.research.extract(url);
  }

  /** Saves a candidate as a real source card — deterministic, no API key required. */
  async saveResearchResultAsSource(url: string): Promise<void> {
    await this.research.saveAsSource(url);
  }

  /** Synthesizes a cited brief from exactly the kept candidates. */
  async createResearchBrief(): Promise<boolean> {
    return this.research.createBrief();
  }

  closeResearch(): void {
    this.research.close();
  }

  // --- Mission Control & Gap Report (delegated to MissionWorkflow) ---

  openGapReport(): void {
    this.mission.openGapReport();
  }

  closeGapReport(): void {
    this.mission.closeGapReport();
  }

  /** Closes the report and opens the status-report preflight pre-filled with it. */
  enrichGapReport(): void {
    this.mission.enrichGapReport();
  }

  openMissionEditor(): void {
    this.mission.openEditor();
  }

  closeMissionEditor(): void {
    this.mission.closeEditor();
  }

  updateMissionDraft(patch: Partial<MissionDraft>): void {
    this.mission.updateDraft(patch);
  }

  addMissionCriterion(text: string): void {
    this.mission.addCriterion(text);
  }

  removeMissionCriterion(index: number): void {
    this.mission.removeCriterion(index);
  }

  /** Persists the current mission draft onto the active workspace. */
  async saveMission(): Promise<void> {
    await this.mission.saveDraft();
  }

  /** Moves the mission to another phase and persists it. */
  async setMissionPhase(phase: WorkspacePhase): Promise<void> {
    await this.mission.setPhase(phase);
  }

  /** One explicit model call turning the mission into a persisted mini-syllabus. */
  async generateSyllabus(): Promise<void> {
    await this.mission.generateSyllabus();
  }

  private activeWorkspace(): Workspace | undefined {
    return this.domain.workspaces.find(
      (w) => w.id === this.domain.activeWorkspaceId,
    );
  }


  // --- Spaced Repetition Review Flow (delegated to ReviewSession) ---

  /** FSRS interval previews for all four grade buttons on a card. */
  getReviewPreviews(cardId: string): Record<ReviewGrade, ReviewPreview> | null {
    return this.review.previews(cardId);
  }

  /** Opens a study session; `cram` studies regardless of what is actually due. */
  startReview(cram: boolean = false): void {
    this.review.start(cram);
  }

  revealReviewAnswer(): void {
    this.review.reveal();
  }

  async gradeReview(grade: boolean | ReviewGrade): Promise<void> {
    await this.review.grade(grade);
  }

  closeReview(): void {
    this.review.close();
  }

  // --- Models ---

  async loadAvailableModels(): Promise<void> {
    this.ui.isLoadingModels = true;
    this.emit();
    try {
      this.domain.availableModels = await this.loadModelsInteractor.execute();
      this.logger.debug("models.loaded", {
        count: this.domain.availableModels.length,
      });
    } catch (err: any) {
      this.logger.error("models.loadFailed", err);
    } finally {
      this.ui.isLoadingModels = false;
      this.emit();
    }
  }

  // --- Assistant Profile Methods ---

  private async loadAssistantProfiles(): Promise<AssistantProfile[]> {
    const stored = await this.assistantProfileRepo.getProfiles();
    const byId = new Map(stored.map((p) => [p.id, p]));
    for (const def of BUILTIN_ASSISTANT_PROFILES) {
      if (!byId.has(def.id)) {
        await this.assistantProfileRepo.saveProfile(def);
        byId.set(def.id, def);
      }
    }
    return Array.from(byId.values());
  }

  async designAssistantProfile(
    capability: AssistantCapability,
    messages: ChatMessage[],
  ): Promise<PromptDesignResponse> {
    if (!this.agentGateway.designAssistantProfile) {
      throw new Error(
        "The active agent gateway does not support prompt architect design",
      );
    }
    if (!this.domain.openRouterKey?.trim()) {
      throw new Error("Enter your OpenRouter API key in Settings first");
    }
    return this.agentGateway.designAssistantProfile({
      capability,
      messages,
      apiKey: this.domain.openRouterKey,
      model: this.domain.selectedModel,
    });
  }

  async saveAssistantProfile(
    profile: AssistantProfile,
  ): Promise<AssistantProfile> {
    await this.assistantProfileRepo.saveProfile(profile);
    this.domain.assistantProfiles = await this.loadAssistantProfiles();
    this.emit();
    this.showToast(`Saved assistant "${profile.name}"`);
    return profile;
  }

  async deleteAssistantProfile(id: string): Promise<void> {
    const target = this.domain.assistantProfiles.find((p) => p.id === id);
    if (!target) return;
    if (target.builtin) {
      this.showToast("Built-in profiles cannot be deleted");
      return;
    }
    await this.assistantProfileRepo.deleteProfile(id);
    this.domain.assistantProfiles = await this.loadAssistantProfiles();
    this.emit();
    this.showToast(`Deleted assistant "${target.name}"`);
  }

  setActiveProfileForCapability(
    capability: AssistantCapability,
    profileId: string,
  ): void {
    this.domain.activeProfileIds = {
      ...this.domain.activeProfileIds,
      [capability]: profileId,
    };
    void this.saveCurrentSettings();
    this.emit();
  }

  // --- Internal Utilities ---

  private async loadCardsForActiveWorkspace(): Promise<void> {
    const workspaceId = this.domain.activeWorkspaceId;
    const loadToken = ++this.workspaceLoadToken;
    if (workspaceId) {
      const cards = await this.cardRepo.getCardsByWorkspace(workspaceId);
      if (
        loadToken === this.workspaceLoadToken &&
        this.domain.activeWorkspaceId === workspaceId
      ) {
        this.domain.cards = cards;
      }
    } else if (loadToken === this.workspaceLoadToken) {
      this.domain.cards = [];
    }
  }

  private showToast(message: string): void {
    this.session.showToast(message);
  }

  private emit(): void {
    this.session.emit();
  }
}

function encodePipelineArgument(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
