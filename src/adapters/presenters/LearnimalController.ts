import { Card } from "../../entities/card";
import { Workspace } from "../../entities/workspace";
import { CardRepository } from "../repositories/CardRepository";
import { WorkspaceRepository } from "../repositories/WorkspaceRepository";
import {
  AppSettings,
  SettingsRepository,
} from "../repositories/SettingsRepository";
import { AgentGateway, AgentModel } from "../gateways/AgentGateway";
import { UseCaseError } from "../../usecases/errors";
import { PipelineRunner } from "../../usecases/pipeline/PipelineRunner";
import { AskCommand } from "../../usecases/pipeline/AskCommand";
import { SourceCommand } from "../../usecases/pipeline/SourceCommand";
import { NoteCommand } from "../../usecases/pipeline/NoteCommand";
import { CreateNote } from "../../usecases/card/CreateNote";
import { ChunkCommand } from "../../usecases/pipeline/ChunkCommand";
import { RecallCommand } from "../../usecases/pipeline/RecallCommand";
import { SpaceCommand } from "../../usecases/pipeline/SpaceCommand";
import { MoveCommand } from "../../usecases/pipeline/MoveCommand";
import { ReviewCommand } from "../../usecases/pipeline/ReviewCommand";
import { GroupCommand } from "../../usecases/pipeline/GroupCommand";
import { UngroupCommand } from "../../usecases/pipeline/UngroupCommand";
import { DeleteCommand } from "../../usecases/pipeline/DeleteCommand";
import { SearchCommand } from "../../usecases/pipeline/SearchCommand";
import { ClozeCommand } from "../../usecases/pipeline/ClozeCommand";
import { ElaborateCommand } from "../../usecases/pipeline/ElaborateCommand";
import { ChatCommand } from "../../usecases/pipeline/ChatCommand";
import { SplitCommand } from "../../usecases/pipeline/SplitCommand";
import { ChatMessage } from "../gateways/AgentGateway";
import { SearchGateway } from "../gateways/SearchGateway";
import { ExtractionGateway } from "../gateways/ExtractionGateway";
import { GroupCardsInteractor } from "../../usecases/grouping/GroupCardsInteractor";
import {
  breadcrumbPath,
  directChildren,
  expandForPipe,
} from "../../usecases/tree";
import { CommandDefinition } from "../../entities/commandDefinition";
import { CommandDefinitionRepository } from "../repositories/CommandDefinitionRepository";
import {
  BUILTIN_CARD_TYPES,
  CardTypeDefinition,
} from "../../entities/cardTypeDefinition";
import { CardTypeRepository } from "../repositories/CardTypeRepository";
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
import { PromptPresetRepository } from "../repositories/PromptPresetRepository";
import { AssistantProfileRepository } from "../repositories/AssistantProfileRepository";
import { AsyncStorageAssistantProfileRepository } from "../../frameworks/storage/AsyncStorageAssistantProfileRepository";
import { PromptDesignResponse } from "../gateways/AgentGateway";
import {
  CreateCardTypeInteractor,
  CreateCardTypeRequest,
} from "../../usecases/cardTypes/CreateCardTypeInteractor";
import { DeleteCardTypeInteractor } from "../../usecases/cardTypes/DeleteCardTypeInteractor";
import { PipelineCommand } from "../../usecases/pipeline/Command";
import { createPipelineCommand } from "../../usecases/pipeline/CommandFactory";
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
import { ReviewLogRepository } from "../repositories/ReviewLogRepository";
import { DEFAULT_FSRS_CONFIG } from "../../entities/workspace";
import { buildAgentRunRequest, buildPipelineText, findOperationPreset } from "../../usecases/agent/operationPresets";

// Default prompts are now *instructions* (the strict JSON format contract is appended
// by the gateway via composeCardPrompt), so users can edit them freely.
export const DEFAULT_SYSTEM_PROMPT = DEFAULT_CARD_INSTRUCTION;
export const DEFAULT_CHUNK_SYSTEM_PROMPT = DEFAULT_CHUNK_INSTRUCTION;

/**
 * # Learnimal Application State Model
 *
 * The public ViewModel consumed by the UI. It is composed from the controller's
 * internal {@link DomainState} (business data) and {@link UiState} (ephemeral
 * presentation flags) — see {@link LearnimalController.getState}.
 */
export interface PendingOperation {
  id: string;
  commandName: string;
  status: "loading" | "error";
  errorMessage?: string;
  /** The pipeline text to re-run on retry (defaults to commandName). */
  pipelineText?: string;
  /** Selection that seeded the run, so a retry restores the same input context. */
  inputCardIds?: string[];
  /** The group the run targeted, restored on retry. */
  parentId?: string | null;
  /** Workspace where the operation originated. */
  workspaceId?: string;
}

export interface OperationResult {
  summary: string;
  createdCardIds: string[];
  destination: {
    spaceId: string;
    groupId?: string;
    cardId?: string;
  };
  primaryActionLabel: string;
}

export interface AppState {
  theme: "dark" | "light";
  accent: "teal" | "lilac" | "amber" | "rose" | "arctic";
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
}

/** Business/domain state: persisted or derivable data, free of UI concerns. */
interface DomainState {
  theme: "dark" | "light";
  accent: "teal" | "lilac" | "amber" | "rose" | "arctic";
  openRouterKey: string;
  selectedModel: string;
  customSystemPrompt: string;
  customChunkSystemPrompt: string;
  availableModels: AgentModel[];
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  cards: Card[];
  currentGroupId: string | null;
  selection: Set<string>;
  pinnedCommands: string[];
  autoGroupByCommand: boolean;
  interleaveReviews: boolean;
  commandDefinitions: CommandDefinition[];
  cardTypes: CardTypeDefinition[];
  promptPresets: PromptPreset[];
  assistantProfiles: AssistantProfile[];
  activeProfileIds: Partial<Record<AssistantCapability, string>>;
  reviewQueue: Card[];
  reviewIndex: number;
  searchSiteFlags: Record<string, string>;
}

/** Ephemeral presentation state: open sheets, toasts, and transient toggles. */
interface UiState {
  openCardId: string | null;
  isReviewOpen: boolean;
  reviewRevealAnswer: boolean;
  pinEditMode: boolean;
  isModalOpen: boolean;
  isWorkspaceSheetOpen: boolean;
  isSettingsSheetOpen: boolean;
  isInputSheetOpen: boolean;
  inputSheetMode: "source" | "ask" | "note";
  activePreflightPresetId: string | null;
  preflightQuery: string;
  pendingCommandName: string;
  toastMessage: string;
  isLoadingModels: boolean;
  pendingOperations: PendingOperation[];
  operationResult: OperationResult | null;
  chatStreamingCardId: string | null;
}

export interface LearnimalControllerDeps {
  cardRepo: CardRepository;
  workspaceRepo: WorkspaceRepository;
  settingsRepo: SettingsRepository;
  agentGateway: AgentGateway;
  commandDefinitionRepo: CommandDefinitionRepository;
  cardTypeRepo: CardTypeRepository;
  promptPresetRepo: PromptPresetRepository;
  assistantProfileRepo?: AssistantProfileRepository;
  searchGateway: SearchGateway;
  extractionGateway: ExtractionGateway;
  reviewLogRepo?: ReviewLogRepository;
}

/**
 * # Learnimal Main Application Controller (Clean Architecture Interface Adapter)
 *
 * ## Business Value & Purpose
 * Coordinates application state and the UI. It is a thin presenter: it holds the
 * split {@link DomainState}/{@link UiState}, delegates every real operation to a
 * single-responsibility use-case interactor, applies the returned response models
 * to state, maps {@link UseCaseError}s to toasts, and notifies subscribers. The UI
 * stays a dumb mapping of {@link AppState} to widgets.
 */
export class LearnimalController {
  private cardRepo: CardRepository;
  private workspaceRepo: WorkspaceRepository;
  private settingsRepo: SettingsRepository;
  private agentGateway: AgentGateway;
  private commandDefinitionRepo: CommandDefinitionRepository;
  private cardTypeRepo: CardTypeRepository;
  private promptPresetRepo: PromptPresetRepository;
  private assistantProfileRepo: AssistantProfileRepository;

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
  private extractUrlInteractor: ExtractUrlInteractor;
  private groupCardsInteractor: GroupCardsInteractor;
  private fsrsScheduler: FsrsScheduler;
  private reviewLogRepo?: ReviewLogRepository;

  /** Built-in pipeline commands; combined with custom commands by rebuildPipeline. */
  private builtinCommands: PipelineCommand[] = [];

  private domain: DomainState;
  private ui: UiState;
  private listeners: Set<(state: AppState) => void> = new Set();
  private workspaceLoadToken = 0;
  private pendingPipelineResume: {
    command: string;
    remainingPipeline: string;
    inputCardIds: string[];
    parentId: string | null;
  } | null = null;

  constructor(deps: LearnimalControllerDeps) {
    this.cardRepo = deps.cardRepo;
    this.workspaceRepo = deps.workspaceRepo;
    this.settingsRepo = deps.settingsRepo;
    this.agentGateway = deps.agentGateway;
    this.commandDefinitionRepo = deps.commandDefinitionRepo;
    this.cardTypeRepo = deps.cardTypeRepo;
    this.promptPresetRepo = deps.promptPresetRepo;
    this.assistantProfileRepo =
      deps.assistantProfileRepo || new AsyncStorageAssistantProfileRepository();

    // Compose built-in pipeline commands from the injected ports. Custom commands
    // are layered on top by rebuildPipeline() once their definitions are loaded.
    this.createNoteUseCase = new CreateNote(deps.cardRepo);
    this.groupCardsInteractor = new GroupCardsInteractor(deps.cardRepo);
    this.builtinCommands = [
      new NoteCommand(this.createNoteUseCase),
      new AskCommand(deps.agentGateway, deps.cardRepo),
      new SourceCommand(deps.cardRepo, deps.extractionGateway),
      new ChunkCommand(deps.agentGateway, deps.cardRepo),
      new SplitCommand(deps.cardRepo),
      new RecallCommand(deps.cardRepo),
      new SpaceCommand(deps.cardRepo),
      new MoveCommand(deps.cardRepo),
      new ReviewCommand(),
      new GroupCommand(this.groupCardsInteractor),
      new UngroupCommand(deps.cardRepo),
      new DeleteCommand(deps.cardRepo),
      new SearchCommand(deps.searchGateway, deps.cardRepo, deps.settingsRepo),
      new ClozeCommand(deps.cardRepo),
      new ElaborateCommand(deps.cardRepo),
      new ChatCommand(deps.cardRepo),
    ];
    this.pipeline = new PipelineRunner(this.builtinCommands);

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

    this.domain = {
      theme: "dark",
      accent: "teal",
      openRouterKey: "",
      selectedModel: "",
      customSystemPrompt: DEFAULT_SYSTEM_PROMPT,
      customChunkSystemPrompt: DEFAULT_CHUNK_SYSTEM_PROMPT,
      availableModels: [],
      workspaces: [],
      activeWorkspaceId: null,
      cards: [],
      currentGroupId: null,
      selection: new Set(),
      pinnedCommands: [
        "ask",
        "search",
        "chunk",
        "split",
        "recall",
        "space",
        "review",
      ],
      autoGroupByCommand: true,
      interleaveReviews: true,
      commandDefinitions: [],
      cardTypes: [...BUILTIN_CARD_TYPES],
      promptPresets: [...BUILTIN_PROMPT_PRESETS],
      assistantProfiles: [...BUILTIN_ASSISTANT_PROFILES],
      activeProfileIds: {
        "generate-cards": "builtin-generate-cards",
        "chunk-document": "builtin-chunk-document",
        chat: "builtin-chat",
        cloze: "builtin-cloze",
      },
      reviewQueue: [],
      reviewIndex: 0,
      searchSiteFlags: {
        wiki: "wikipedia.org",
        nature: "nature.com",
      },
    };

    this.ui = {
      openCardId: null,
      isReviewOpen: false,
      reviewRevealAnswer: false,
      pinEditMode: false,
      isModalOpen: false,
      isWorkspaceSheetOpen: false,
      isSettingsSheetOpen: false,
      isInputSheetOpen: false,
      inputSheetMode: "source",
      activePreflightPresetId: null,
      preflightQuery: "",
      pendingCommandName: "",
      toastMessage: "",
      isLoadingModels: false,
      pendingOperations: [],
      operationResult: null,
      chatStreamingCardId: null,
    };
  }

  /**
   * Initializes the application by fetching workspaces and initial settings.
   */
  async init(): Promise<void> {
    const logTimestamp = new Date().toISOString();
    try {
      this.domain.workspaces = await this.workspaceRepo.getWorkspaces();

      const settings = await this.settingsRepo.getSettings();
      if (settings) {
        this.domain.theme = settings.theme || "dark";
        this.domain.accent = settings.accent || "teal";
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
      this.rebuildPipeline();

      if (this.domain.workspaces.length === 0) {
        const defaultWs =
          await this.createWorkspaceInteractor.execute("My Workspace");
        this.domain.workspaces.push(defaultWs);
        this.domain.activeWorkspaceId = defaultWs.id;
      } else {
        this.domain.activeWorkspaceId = this.domain.workspaces[0].id;
      }
      await this.loadCardsForActiveWorkspace();
      this.loadAvailableModels();
      this.emit();
      console.log(`[${logTimestamp}] [LearnimalController.init] SUCCESS`);
    } catch (err: any) {
      console.error(
        `[${logTimestamp}] [LearnimalController.init] ERROR: ${err.message}`,
      );
      this.showToast("Initialization failed");
    }
  }

  /**
   * Subscribes a listener function to be called on every state update.
   *
   * @param listener The state change callback.
   * @returns An unsubscribe function.
   */
  subscribe(listener: (state: AppState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Retrieves the current immutable ViewModel, composed from domain + UI state.
   */
  getState(): AppState {
    return {
      theme: this.domain.theme,
      accent: this.domain.accent,
      workspaces: [...this.domain.workspaces],
      activeWorkspaceId: this.domain.activeWorkspaceId,
      cards: [...this.domain.cards],
      visibleCards: directChildren(
        this.domain.cards,
        this.domain.currentGroupId,
      ),
      currentGroupId: this.domain.currentGroupId,
      breadcrumb: breadcrumbPath(this.domain.cards, this.domain.currentGroupId),
      selection: new Set(this.domain.selection),
      pinnedCommands: [...this.domain.pinnedCommands],
      autoGroupByCommand: this.domain.autoGroupByCommand,
      interleaveReviews: this.domain.interleaveReviews,
      commandDefinitions: [...this.domain.commandDefinitions],
      cardTypes: [...this.domain.cardTypes],
      promptPresets: [...this.domain.promptPresets],
      assistantProfiles: [...this.domain.assistantProfiles],
      activeProfileIds: { ...this.domain.activeProfileIds },
      pendingCommandName: this.ui.pendingCommandName,
      reviewQueue: [...this.domain.reviewQueue],
      reviewIndex: this.domain.reviewIndex,
      openRouterKey: this.domain.openRouterKey,
      selectedModel: this.domain.selectedModel,
      customSystemPrompt: this.domain.customSystemPrompt,
      customChunkSystemPrompt: this.domain.customChunkSystemPrompt,
      availableModels: [...this.domain.availableModels],
      openCardId: this.ui.openCardId,
      isReviewOpen: this.ui.isReviewOpen,
      reviewRevealAnswer: this.ui.reviewRevealAnswer,
      pinEditMode: this.ui.pinEditMode,
      isModalOpen: this.ui.isModalOpen,
      isWorkspaceSheetOpen: this.ui.isWorkspaceSheetOpen,
      isSettingsSheetOpen: this.ui.isSettingsSheetOpen,
      isInputSheetOpen: this.ui.isInputSheetOpen,
      inputSheetMode: this.ui.inputSheetMode,
      activePreflightPresetId: this.ui.activePreflightPresetId,
      preflightQuery: this.ui.preflightQuery,
      toastMessage: this.ui.toastMessage,
      isLoadingModels: this.ui.isLoadingModels,
      pendingOperations: this.ui.pendingOperations,
      operationResult: this.ui.operationResult,
      searchSiteFlags: this.domain.searchSiteFlags,
      chatStreamingCardId: this.ui.chatStreamingCardId,
    };
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
    const logTimestamp = new Date().toISOString();
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
        this.emit();
      }
    }
    this.showToast("Note saved");
    console.log(
      `[${logTimestamp}] [LearnimalController.createNote] SUCCESS | noteId=${note.id}`,
    );
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
  async deleteSelection(recursiveGroups: boolean): Promise<void> {
    const selectedIds = new Set(this.domain.selection);
    const selectedCards = this.domain.cards.filter((card) =>
      selectedIds.has(card.id),
    );
    const depthOf = (card: Card): number => {
      let depth = 0;
      let parentId = card.parentId;
      while (parentId) {
        depth += 1;
        parentId = this.domain.cards.find(
          (candidate) => candidate.id === parentId,
        )?.parentId;
      }
      return depth;
    };

    // Recursive group deletion already removes selected descendants. For promotion,
    // remove descendants first so selected children are not promoted unexpectedly.
    const cardsToDelete = selectedCards
      .filter((card) => {
        if (!recursiveGroups) return true;
        let parentId = card.parentId;
        while (parentId) {
          if (selectedIds.has(parentId)) return false;
          parentId = this.domain.cards.find(
            (candidate) => candidate.id === parentId,
          )?.parentId;
        }
        return true;
      })
      .sort((left, right) => depthOf(right) - depthOf(left));

    let nextGroupId = this.domain.currentGroupId;
    if (nextGroupId) {
      const currentGroup = this.domain.cards.find(
        (card) => card.id === nextGroupId,
      );
      const selectedAncestor = selectedCards
        .filter((selected) => {
          if (selected.type !== "group") return false;
          let candidateId: string | undefined = nextGroupId ?? undefined;
          while (candidateId) {
            if (candidateId === selected.id) return true;
            candidateId = this.domain.cards.find(
              (card) => card.id === candidateId,
            )?.parentId;
          }
          return false;
        })
        .sort((left, right) => depthOf(left) - depthOf(right))[0];
      if (
        selectedAncestor &&
        (recursiveGroups || selectedAncestor.id === nextGroupId)
      ) {
        nextGroupId =
          selectedAncestor.parentId ?? currentGroup?.parentId ?? null;
      }
    }

    for (const card of cardsToDelete) {
      await this.deleteCardInteractor.execute(
        card,
        recursiveGroups && card.type === "group",
      );
    }

    this.domain.currentGroupId = nextGroupId;
    this.domain.selection.clear();
    this.ui.openCardId = null;
    await this.loadCardsForActiveWorkspace();
    this.emit();
    this.showToast(
      `${selectedCards.length} item${selectedCards.length === 1 ? "" : "s"} deleted`,
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

  async openOperationResult(): Promise<void> {
    const result = this.ui.operationResult;
    if (!result) return;
    if (result.destination.spaceId !== this.domain.activeWorkspaceId) {
      await this.switchWorkspace(result.destination.spaceId);
    }
    if (this.domain.activeWorkspaceId !== result.destination.spaceId) return;
    this.domain.currentGroupId = result.destination.groupId ?? null;
    this.domain.selection = new Set(result.createdCardIds);
    this.ui.operationResult = null;
    this.emit();
  }

  dismissOperationResult(): void {
    this.ui.operationResult = null;
    this.emit();
  }

  // --- Custom Commands ---

  /**
   * Rebuilds the pipeline's command set from the built-ins plus the current custom
   * command definitions. Called whenever definitions are loaded or change.
   */
  private rebuildPipeline(): void {
    const customCommands = this.domain.commandDefinitions.map((def) =>
      createPipelineCommand(def, {
        agentGateway: this.agentGateway,
        cardRepo: this.cardRepo,
        // Lazy thunk: pipeline-macro commands expand into whatever the current runner
        // is, so a macro can call other custom commands defined alongside it.
        getRunner: () => this.pipeline,
      }),
    );
    this.pipeline = new PipelineRunner([
      ...this.builtinCommands,
      ...customCommands,
    ]);
  }

  /** Defines and registers a new custom command, then makes it usable immediately. */
  async createCustomCommand(
    request: CreateCommandDefinitionRequest,
  ): Promise<void> {
    const logTimestamp = new Date().toISOString();
    try {
      const definition =
        await this.createCommandDefinitionInteractor.execute(request);
      this.domain.commandDefinitions.push(definition);
      this.rebuildPipeline();
      this.ui.isInputSheetOpen = false;
      this.showToast(`Created command: ${definition.name}`);
      console.log(
        `[${logTimestamp}] [LearnimalController.createCustomCommand] SUCCESS | name=${definition.name}`,
      );
    } catch (err: any) {
      console.error(
        `[${logTimestamp}] [LearnimalController.createCustomCommand] ERROR: ${err.message}`,
      );
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
    const logTimestamp = new Date().toISOString();
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
    console.log(
      `[${logTimestamp}] [LearnimalController.deleteCard] SUCCESS | cardId=${cardId}`,
    );
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
    this.domain.reviewQueue = this.domain.reviewQueue.map((c) =>
      c.id === cardId ? updated : c,
    );
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
    const logTimestamp = new Date().toISOString();
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
      console.log(
        `[${logTimestamp}] [LearnimalController.extractUrlToCard] SUCCESS | cardId=${card.id}`,
      );
    } catch (err: any) {
      console.error(
        `[${logTimestamp}] [LearnimalController.extractUrlToCard] ERROR: ${err.message}`,
      );
      this.setPendingOperationError(opId, `Failed to extract: ${err.message}`);
      this.showToast(`Extraction failed: ${err.message}`);
    }
  }

  private currentSettings(): AppSettings {
    return {
      theme: this.domain.theme,
      accent: this.domain.accent,
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
    const logTimestamp = new Date().toISOString();
    try {
      await this.saveSettingsInteractor.execute(this.currentSettings());
      console.log(
        `[${logTimestamp}] [LearnimalController.saveCurrentSettings] SUCCESS`,
      );
    } catch (err: any) {
      console.error(
        `[${logTimestamp}] [LearnimalController.saveCurrentSettings] ERROR: ${err.message}`,
      );
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
    const logTimestamp = new Date().toISOString();
    const startedAt = Date.now();
    console.log(
      `[${logTimestamp}] [LearnimalController.runPipeline] Running: "${pipelineText}"`,
    );

    const workspaceId = this.domain.activeWorkspaceId;
    if (!workspaceId) {
      this.showToast("Create a workspace first");
      return false;
    }

    this.ui.isModalOpen = false;
    this.ui.isInputSheetOpen = false;
    this.pendingPipelineResume = null;
    this.emit();

    // Resolve the input context: a retry restores the original selection/group;
    // otherwise expand the current selection so piping a group feeds its descendants.
    const targetParentId = retry ? retry.parentId : this.domain.currentGroupId;
    const initialInputCards = retry
      ? this.domain.cards.filter((c) => retry.inputCardIds.includes(c.id))
      : expandForPipe(this.domain.cards, this.domain.selection);

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
        this.ui.pendingCommandName = outcome.command;
        if (outcome.resume) {
          if (this.domain.activeWorkspaceId === workspaceId)
            await this.loadCardsForActiveWorkspace();
          this.pendingPipelineResume = {
            command: outcome.resume.command,
            remainingPipeline: outcome.resume.remainingPipeline,
            inputCardIds: outcome.resume.inputCards.map((card) => card.id),
            parentId: targetParentId,
          };
        }
        this.setInputSheetOpen(true, outcome.mode);
        return false;
      }
      if (outcome.kind === "review") {
        this.startReview();
        return true;
      }

      if (outcome.cards.length > 0) {
        let destinationGroupId =
          commonParentId(outcome.cards) ?? targetParentId ?? undefined;
        const parentIds = new Set(
          outcome.cards.map((card) => card.parentId ?? null),
        );
        const generatedTogether = outcome.cards.every(
          (card) => card.createdAt >= startedAt,
        );
        if (
          this.domain.autoGroupByCommand &&
          outcome.cards.length > 1 &&
          generatedTogether &&
          parentIds.size === 1
        ) {
          const commandName = pipelineText.match(/^\s*([\w-]+)/)?.[1] ?? "command";
          const group = await this.groupCardsInteractor.execute({
            workspaceId,
            parentId: outcome.cards[0].parentId ?? targetParentId,
            name: `${commandName} output`,
            cards: outcome.cards,
          });
          destinationGroupId = group.id;
        }
        const outputLabel = outcome.cards.every((card) => card.type === "chunk")
          ? "study chunk"
          : "item";
        this.ui.operationResult = {
          summary: `${outcome.cards.length} ${outputLabel}${outcome.cards.length === 1 ? "" : "s"} created`,
          createdCardIds: outcome.cards.map((card) => card.id),
          destination: {
            spaceId: workspaceId,
            groupId: destinationGroupId,
            cardId:
              outcome.cards.length === 1 ? outcome.cards[0].id : undefined,
          },
          primaryActionLabel: destinationGroupId
            ? "Open document"
            : "Open result",
        };
      }
      if (this.domain.activeWorkspaceId === workspaceId) {
        this.domain.selection = new Set(outcome.cards.map((c) => c.id));
        await this.loadCardsForActiveWorkspace();
      }
      this.emit();
      return true;
    } catch (err: any) {
      console.error(
        `[${logTimestamp}] [LearnimalController.runPipeline] ERROR: ${err.message}`,
      );
      const errorMessage =
        err instanceof UseCaseError ? err.userMessage : "Pipeline failed";
      this.setPendingOperationError(opId, errorMessage);
      this.showToast(errorMessage);
      return false;
    }
  }

  public addPendingOperation(
    commandName: string,
    retry?: {
      pipelineText: string;
      inputCardIds: string[];
      parentId: string | null;
    },
  ): string {
    const id = Math.random().toString(36).substring(2, 9);
    this.ui.pendingOperations = [
      ...this.ui.pendingOperations,
      {
        id,
        commandName,
        status: "loading",
        workspaceId: this.domain.activeWorkspaceId ?? undefined,
        ...retry,
      },
    ];
    this.emit();
    return id;
  }

  /**
   * Re-runs a failed pipeline operation, restoring the exact selection and group it
   * originally ran against so the retry is faithful (not dependent on whatever is
   * selected now).
   */
  async retryPipeline(opId: string): Promise<void> {
    const op = this.ui.pendingOperations.find((o) => o.id === opId);
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
    this.ui.pendingOperations = this.ui.pendingOperations.map((op) =>
      op.id === id ? { ...op, status: "error", errorMessage } : op,
    );
    this.emit();
  }

  public removePendingOperation(id: string): void {
    this.ui.pendingOperations = this.ui.pendingOperations.filter(
      (op) => op.id !== id,
    );
    this.emit();
  }

  // --- AI Preflight (explicit scope before every AI/web operation) ---

  /**
   * Opens the preflight sheet for a named operation preset (see `operationPresets.ts`).
   * The sheet itself is rendered by presenting the current state through
   * `presentAgentPreflight` — this only tracks which preset is open and its query text.
   */
  openPreflight(presetId: string): void {
    if (!findOperationPreset(presetId)) return;
    this.ui.activePreflightPresetId = presetId;
    this.ui.preflightQuery = "";
    this.emit();
  }

  closePreflight(): void {
    this.ui.activePreflightPresetId = null;
    this.ui.preflightQuery = "";
    this.emit();
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
    const ok = await this.runPipeline(pipelineText, {
      inputCardIds: request.contextCardIds,
      parentId: this.domain.currentGroupId,
    });

    if (ok) {
      this.ui.activePreflightPresetId = null;
      this.ui.preflightQuery = "";
      this.emit();
    }
    return ok;
  }

  // --- Spaced Repetition Review Flow ---

  /**
   * Calculates FSRS interval previews for all 4 grade buttons for a specific card.
   */
  getReviewPreviews(cardId: string): Record<ReviewGrade, ReviewPreview> | null {
    const card = this.domain.cards.find((c) => c.id === cardId);
    if (!card) return null;
    const ws = this.domain.workspaces.find(
      (w) => w.id === this.domain.activeWorkspaceId,
    );
    const config = ws?.fsrsConfig || DEFAULT_FSRS_CONFIG;
    return this.fsrsScheduler.preview(card, Date.now(), config);
  }

  startReview(cram: boolean = false): void {
    const logTimestamp = new Date().toISOString();
    try {
      const queue = this.startReviewInteractor.execute(
        this.domain.cards,
        Date.now(),
        this.domain.interleaveReviews,
        cram,
        this.domain.cardTypes,
      );
      this.domain.reviewQueue = queue;
      this.domain.reviewIndex = 0;
      this.ui.isReviewOpen = true;
      this.ui.reviewRevealAnswer = false;
      this.emit();
      console.log(
        `[${logTimestamp}] [LearnimalController.startReview] Started review with ${queue.length} cards (cram=${cram})`,
      );
    } catch (err: any) {
      console.log(
        `[${logTimestamp}] [LearnimalController.startReview] Halted: ${err.message}`,
      );
      this.showToast(
        err instanceof UseCaseError
          ? err.userMessage
          : "Could not start review",
      );
    }
  }

  revealReviewAnswer(): void {
    this.ui.reviewRevealAnswer = true;
    this.emit();
  }

  async gradeReview(grade: boolean | ReviewGrade): Promise<void> {
    const logTimestamp = new Date().toISOString();
    const currentCard = this.domain.reviewQueue[this.domain.reviewIndex];
    if (!currentCard) return;

    const ws = this.domain.workspaces.find(
      (w) => w.id === this.domain.activeWorkspaceId,
    );
    const config = ws?.fsrsConfig || DEFAULT_FSRS_CONFIG;

    const updated = await this.gradeReviewInteractor.execute(
      currentCard,
      grade,
      Date.now(),
      config,
    );
    if (!updated) return;

    this.domain.cards = this.domain.cards.map((card) =>
      card.id === updated.id ? updated : card,
    );
    this.domain.reviewQueue = this.domain.reviewQueue.map((card) =>
      card.id === updated.id ? updated : card,
    );

    const nextIndex = this.domain.reviewIndex + 1;
    if (nextIndex >= this.domain.reviewQueue.length) {
      this.ui.isReviewOpen = false;
      this.domain.reviewQueue = [];
      this.domain.reviewIndex = 0;
      this.ui.reviewRevealAnswer = false;
      await this.loadCardsForActiveWorkspace();
      this.showToast("Review complete!");
      console.log(
        `[${logTimestamp}] [LearnimalController.gradeReview] Finished review session`,
      );
    } else {
      this.domain.reviewIndex = nextIndex;
      this.ui.reviewRevealAnswer = false;
      this.emit();
    }
  }

  closeReview(): void {
    this.ui.isReviewOpen = false;
    this.domain.reviewQueue = [];
    this.domain.reviewIndex = 0;
    this.ui.reviewRevealAnswer = false;
    this.emit();
  }

  // --- Models ---

  async loadAvailableModels(): Promise<void> {
    const logTimestamp = new Date().toISOString();
    this.ui.isLoadingModels = true;
    this.emit();
    try {
      this.domain.availableModels = await this.loadModelsInteractor.execute();
      console.log(
        `[${logTimestamp}] [LearnimalController.loadAvailableModels] SUCCESS | count=${this.domain.availableModels.length}`,
      );
    } catch (err: any) {
      console.error(
        `[${logTimestamp}] [LearnimalController.loadAvailableModels] ERROR: ${err.message}`,
      );
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
    this.ui.toastMessage = message;
    this.emit();

    // Clear toast message after 2.5s
    setTimeout(() => {
      if (this.ui.toastMessage === message) {
        this.ui.toastMessage = "";
        this.emit();
      }
    }, 2500);
  }

  private emit(): void {
    const freshState = this.getState();
    for (const listener of this.listeners) {
      listener(freshState);
    }
  }
}

function encodePipelineArgument(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function commonParentId(cards: Card[]): string | undefined {
  if (cards.length === 0) return undefined;
  const parentId = cards[0].parentId;
  return parentId && cards.every((card) => card.parentId === parentId)
    ? parentId
    : undefined;
}
