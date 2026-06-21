import { Card } from "../../entities/card";
import { Workspace } from "../../entities/workspace";
import { CardRepository } from "../repositories/CardRepository";
import { WorkspaceRepository } from "../repositories/WorkspaceRepository";
import { AppSettings, SettingsRepository } from "../repositories/SettingsRepository";
import { AgentGateway, AgentModel } from "../gateways/AgentGateway";
import { UseCaseError } from "../../usecases/errors";
import { PipelineRunner } from "../../usecases/pipeline/PipelineRunner";
import { AskCommand } from "../../usecases/pipeline/AskCommand";
import { SourceCommand } from "../../usecases/pipeline/SourceCommand";
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
import { ChatMessage } from "../gateways/AgentGateway";
import { SearchGateway } from "../gateways/SearchGateway";
import { ExtractionGateway } from "../gateways/ExtractionGateway";
import { GroupCardsInteractor } from "../../usecases/grouping/GroupCardsInteractor";
import { breadcrumbPath, directChildren, expandForPipe } from "../../usecases/tree";
import { CommandDefinition } from "../../entities/commandDefinition";
import { CommandDefinitionRepository } from "../repositories/CommandDefinitionRepository";
import { BUILTIN_CARD_TYPES, CardTypeDefinition } from "../../entities/cardTypeDefinition";
import { CardTypeRepository } from "../repositories/CardTypeRepository";
import {
  BUILTIN_PROMPT_PRESETS,
  createPromptPreset,
  DEFAULT_CARD_INSTRUCTION,
  DEFAULT_CHUNK_INSTRUCTION,
  PromptPreset,
} from "../../entities/promptPreset";
import { PromptPresetRepository } from "../repositories/PromptPresetRepository";
import { CreateCardTypeInteractor, CreateCardTypeRequest } from "../../usecases/cardTypes/CreateCardTypeInteractor";
import { DeleteCardTypeInteractor } from "../../usecases/cardTypes/DeleteCardTypeInteractor";
import { PipelineCommand } from "../../usecases/pipeline/Command";
import { createPipelineCommand } from "../../usecases/pipeline/CommandFactory";
import { CreateCommandDefinitionInteractor, CreateCommandDefinitionRequest } from "../../usecases/commands/CreateCommandDefinitionInteractor";
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
  inputSheetMode: "source" | "ask";
  toastMessage: string;
  openRouterKey: string;
  selectedModel: string;
  customSystemPrompt: string;
  customChunkSystemPrompt: string;
  availableModels: AgentModel[];
  isLoadingModels: boolean;
  pendingOperations: PendingOperation[];
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
  inputSheetMode: "source" | "ask";
  pendingCommandName: string;
  toastMessage: string;
  isLoadingModels: boolean;
  pendingOperations: PendingOperation[];
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
  searchGateway: SearchGateway;
  extractionGateway: ExtractionGateway;
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
  private extractUrlInteractor: ExtractUrlInteractor;
  private groupCardsInteractor: GroupCardsInteractor;

  /** Built-in pipeline commands; combined with custom commands by rebuildPipeline. */
  private builtinCommands: PipelineCommand[];

  private domain: DomainState;
  private ui: UiState;
  private listeners: Set<(state: AppState) => void> = new Set();

  constructor(deps: LearnimalControllerDeps) {
    this.cardRepo = deps.cardRepo;
    this.workspaceRepo = deps.workspaceRepo;
    this.settingsRepo = deps.settingsRepo;
    this.agentGateway = deps.agentGateway;
    this.commandDefinitionRepo = deps.commandDefinitionRepo;
    this.cardTypeRepo = deps.cardTypeRepo;
    this.promptPresetRepo = deps.promptPresetRepo;

    // Compose built-in pipeline commands from the injected ports. Custom commands
    // are layered on top by rebuildPipeline() once their definitions are loaded.
    this.groupCardsInteractor = new GroupCardsInteractor(deps.cardRepo);
    this.builtinCommands = [
      new AskCommand(deps.agentGateway, deps.cardRepo),
      new SourceCommand(deps.cardRepo),
      new ChunkCommand(deps.agentGateway, deps.cardRepo),
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

    this.createCommandDefinitionInteractor = new CreateCommandDefinitionInteractor(deps.commandDefinitionRepo);
    this.deleteCommandDefinitionInteractor = new DeleteCommandDefinitionInteractor(deps.commandDefinitionRepo);
    this.createCardTypeInteractor = new CreateCardTypeInteractor(deps.cardTypeRepo);
    this.deleteCardTypeInteractor = new DeleteCardTypeInteractor(deps.cardTypeRepo);
    this.deleteCardInteractor = new DeleteCardInteractor(deps.cardRepo);
    this.startReviewInteractor = new StartReviewInteractor();
    this.gradeReviewInteractor = new GradeReviewInteractor(deps.cardRepo);
    this.createWorkspaceInteractor = new CreateWorkspaceInteractor(deps.workspaceRepo);
    this.switchWorkspaceInteractor = new SwitchWorkspaceInteractor(deps.cardRepo);
    this.deleteWorkspaceInteractor = new DeleteWorkspaceInteractor(deps.workspaceRepo, deps.cardRepo);
    this.saveSettingsInteractor = new SaveSettingsInteractor(deps.settingsRepo);
    this.loadModelsInteractor = new LoadModelsInteractor(deps.agentGateway);
    this.extractUrlInteractor = new ExtractUrlInteractor(deps.extractionGateway, deps.cardRepo);

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
      pinnedCommands: ["ask", "search", "chunk", "recall", "space", "review"],
      autoGroupByCommand: true,
      interleaveReviews: true,
      commandDefinitions: [],
      cardTypes: [...BUILTIN_CARD_TYPES],
      promptPresets: [...BUILTIN_PROMPT_PRESETS],
      reviewQueue: [],
      reviewIndex: 0,
      searchSiteFlags: {
        "wiki": "wikipedia.org",
        "nature": "nature.com"
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
      pendingCommandName: "",
      toastMessage: "",
      isLoadingModels: false,
      pendingOperations: [],
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
        this.domain.customSystemPrompt = settings.customSystemPrompt || DEFAULT_SYSTEM_PROMPT;
        this.domain.customChunkSystemPrompt = settings.customChunkSystemPrompt || DEFAULT_CHUNK_SYSTEM_PROMPT;
        this.domain.autoGroupByCommand = settings.autoGroupByCommand ?? true;
        this.domain.interleaveReviews = settings.interleaveReviews ?? true;
        if (settings.searchSiteFlags) {
          this.domain.searchSiteFlags = settings.searchSiteFlags;
        }
      } else {
        this.domain.customSystemPrompt = DEFAULT_SYSTEM_PROMPT;
        this.domain.customChunkSystemPrompt = DEFAULT_CHUNK_SYSTEM_PROMPT;
      }

      this.domain.commandDefinitions = await this.commandDefinitionRepo.getDefinitions();
      this.domain.cardTypes = await this.loadCardTypes();
      this.domain.promptPresets = await this.loadPromptPresets();
      this.rebuildPipeline();

      if (this.domain.workspaces.length === 0) {
        const defaultWs = await this.createWorkspaceInteractor.execute("My Workspace");
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
      console.error(`[${logTimestamp}] [LearnimalController.init] ERROR: ${err.message}`);
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
      visibleCards: directChildren(this.domain.cards, this.domain.currentGroupId),
      currentGroupId: this.domain.currentGroupId,
      breadcrumb: breadcrumbPath(this.domain.cards, this.domain.currentGroupId),
      selection: new Set(this.domain.selection),
      pinnedCommands: [...this.domain.pinnedCommands],
      autoGroupByCommand: this.domain.autoGroupByCommand,
      interleaveReviews: this.domain.interleaveReviews,
      commandDefinitions: [...this.domain.commandDefinitions],
      cardTypes: [...this.domain.cardTypes],
      promptPresets: [...this.domain.promptPresets],
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
      toastMessage: this.ui.toastMessage,
      isLoadingModels: this.ui.isLoadingModels,
      pendingOperations: this.ui.pendingOperations,
      searchSiteFlags: this.domain.searchSiteFlags,
      chatStreamingCardId: this.ui.chatStreamingCardId,
    };
  }

  // --- Selection Methods ---

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

  setInputSheetOpen(isOpen: boolean, mode: "source" | "ask" = "source"): void {
    this.ui.isInputSheetOpen = isOpen;
    this.ui.inputSheetMode = mode;
    this.emit();
  }

  setPinEditMode(isEdit: boolean): void {
    this.ui.pinEditMode = isEdit;
    this.emit();
  }

  togglePinCommand(cmdName: string): void {
    const isPinned = this.domain.pinnedCommands.includes(cmdName);
    if (isPinned) {
      this.domain.pinnedCommands = this.domain.pinnedCommands.filter(c => c !== cmdName);
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

  // --- Custom Commands ---

  /**
   * Rebuilds the pipeline's command set from the built-ins plus the current custom
   * command definitions. Called whenever definitions are loaded or change.
   */
  private rebuildPipeline(): void {
    const customCommands = this.domain.commandDefinitions.map(def =>
      createPipelineCommand(def, {
        agentGateway: this.agentGateway,
        cardRepo: this.cardRepo,
        // Lazy thunk: pipeline-macro commands expand into whatever the current runner
        // is, so a macro can call other custom commands defined alongside it.
        getRunner: () => this.pipeline,
      })
    );
    this.pipeline = new PipelineRunner([...this.builtinCommands, ...customCommands]);
  }

  /** Defines and registers a new custom command, then makes it usable immediately. */
  async createCustomCommand(request: CreateCommandDefinitionRequest): Promise<void> {
    const logTimestamp = new Date().toISOString();
    try {
      const definition = await this.createCommandDefinitionInteractor.execute(request);
      this.domain.commandDefinitions.push(definition);
      this.rebuildPipeline();
      this.ui.isInputSheetOpen = false;
      this.showToast(`Created command: ${definition.name}`);
      console.log(`[${logTimestamp}] [LearnimalController.createCustomCommand] SUCCESS | name=${definition.name}`);
    } catch (err: any) {
      console.error(`[${logTimestamp}] [LearnimalController.createCustomCommand] ERROR: ${err.message}`);
      this.showToast(err instanceof UseCaseError ? err.userMessage : "Could not create command");
    }
  }

  /** Removes a custom command and unregisters it from the pipeline. */
  async deleteCustomCommand(id: string): Promise<void> {
    await this.deleteCommandDefinitionInteractor.execute(id);
    const removed = this.domain.commandDefinitions.find(d => d.id === id);
    this.domain.commandDefinitions = this.domain.commandDefinitions.filter(d => d.id !== id);
    this.domain.pinnedCommands = this.domain.pinnedCommands.filter(c => c !== removed?.name);
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
    const byId = new Map(stored.map(t => [t.id, t]));
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
      this.showToast(err instanceof UseCaseError ? err.userMessage : "Could not create card type");
    }
  }

  /** Restyles/updates an existing card type (built-in or custom). */
  async updateCardType(definition: CardTypeDefinition): Promise<void> {
    await this.cardTypeRepo.saveType(definition);
    this.domain.cardTypes = this.domain.cardTypes.map(t => (t.id === definition.id ? definition : t));
    this.emit();
  }

  /** Removes a custom card type (built-ins are protected). */
  async deleteCardType(id: string): Promise<void> {
    try {
      await this.deleteCardTypeInteractor.execute(id);
      this.domain.cardTypes = this.domain.cardTypes.filter(t => t.id !== id);
      this.emit();
      this.showToast("Card type deleted");
    } catch (err: any) {
      this.showToast(err instanceof UseCaseError ? err.userMessage : "Could not delete card type");
    }
  }

  // --- Prompt Presets (extendable card-generation instructions) ---

  /** Loads persisted presets, seeding the built-ins on first run and backfilling new ones. */
  private async loadPromptPresets(): Promise<PromptPreset[]> {
    const stored = await this.promptPresetRepo.getPresets();
    if (stored.length === 0) {
      for (const p of BUILTIN_PROMPT_PRESETS) await this.promptPresetRepo.savePreset(p);
      return [...BUILTIN_PROMPT_PRESETS];
    }
    const byId = new Map(stored.map(p => [p.id, p]));
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
    const preset = this.domain.promptPresets.find(p => p.id === id);
    if (!preset) return;
    this.domain.customSystemPrompt = preset.prompt;
    this.domain.customChunkSystemPrompt = preset.prompt;
    this.saveCurrentSettings();
    this.emit();
    this.showToast(`Applied preset: ${preset.name}`);
  }

  /** Saves the current system prompt as a new named, reusable preset. */
  async saveCurrentAsPreset(name: string): Promise<void> {
    const preset = createPromptPreset({ name, prompt: this.domain.customSystemPrompt });
    await this.promptPresetRepo.savePreset(preset);
    this.domain.promptPresets = [...this.domain.promptPresets, preset];
    this.emit();
    this.showToast(`Saved preset: ${preset.name}`);
  }

  /** Removes a user-defined preset (built-ins are protected). */
  async deletePromptPreset(id: string): Promise<void> {
    const preset = this.domain.promptPresets.find(p => p.id === id);
    if (!preset || preset.builtin) {
      this.showToast("Built-in presets can't be deleted");
      return;
    }
    await this.promptPresetRepo.deletePreset(id);
    this.domain.promptPresets = this.domain.promptPresets.filter(p => p.id !== id);
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
    const card = this.domain.cards.find(c => c.id === cardId);
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
    console.log(`[${logTimestamp}] [LearnimalController.deleteCard] SUCCESS | cardId=${cardId}`);
  }

  /**
   * Persists a value into one of a card's schema-defined fields (e.g. the learner's
   * own write-up on an elaboration card). Generic over any field key so custom card
   * types work without bespoke methods.
   */
  async setCardField(cardId: string, key: string, value: string): Promise<void> {
    const card = this.domain.cards.find(c => c.id === cardId);
    if (!card) return;
    const updated: Card = { ...card, fields: { ...(card.fields || {}), [key]: value } };
    await this.cardRepo.saveCard(updated);
    this.domain.cards = this.domain.cards.map(c => (c.id === cardId ? updated : c));
    this.emit();
  }

  /** Re-assigns a card's modular type (e.g. to make it render as interactive HTML). */
  async setCardType(cardId: string, typeId: string): Promise<void> {
    const card = this.domain.cards.find(c => c.id === cardId);
    if (!card) return;
    const updated: Card = { ...card, typeId };
    await this.cardRepo.saveCard(updated);
    this.domain.cards = this.domain.cards.map(c => (c.id === cardId ? updated : c));
    this.emit();
  }

  /** Edits a card's body text (used by the in-card HTML/content editor). */
  async setCardBody(cardId: string, body: string): Promise<void> {
    const card = this.domain.cards.find(c => c.id === cardId);
    if (!card) return;
    const updated: Card = { ...card, body };
    await this.cardRepo.saveCard(updated);
    this.domain.cards = this.domain.cards.map(c => (c.id === cardId ? updated : c));
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
  private async writeChat(cardId: string, messages: ChatMessage[], persist: boolean): Promise<void> {
    const card = this.domain.cards.find(c => c.id === cardId);
    if (!card) return;
    const updated: Card = { ...card, body: JSON.stringify(messages) };
    this.domain.cards = this.domain.cards.map(c => (c.id === cardId ? updated : c));
    if (persist) await this.cardRepo.saveCard(updated);
    this.emit();
  }

  /**
   * Builds the system context for a chat card from the workspace name and the other
   * cards in the same group, so the agent answers grounded in what the user is studying.
   */
  private buildChatContext(card: Card): string {
    const ws = this.domain.workspaces.find(w => w.id === this.domain.activeWorkspaceId);
    const groupCards = this.domain.cards.filter(
      c => c.parentId === card.parentId && c.id !== card.id && c.type !== "group" && c.type !== "chat"
    );
    const cardList = groupCards.length > 0
      ? groupCards.map(c => `- ${c.title}: ${(c.body || c.answer || "").substring(0, 400)}`).join("\n")
      : "(no other cards in this group yet)";
    return `You are a focused study tutor helping the user learn. They are in the workspace "${ws?.name ?? "Untitled"}". Use the following cards from the current group as the primary context for your answers; be accurate and concise, and say when something isn't covered by them.\n\nCards in context:\n${cardList}`;
  }

  /**
   * Sends a user message in a chat card and streams the agent's reply token-by-token,
   * updating the card live. The group's cards + workspace name are supplied as context.
   */
  async sendChatMessage(cardId: string, userText: string): Promise<void> {
    const text = userText.trim();
    if (!text) return;
    const card = this.domain.cards.find(c => c.id === cardId);
    if (!card) return;

    if (!this.agentGateway.streamChat) {
      this.showToast("This model gateway can't stream chat");
      return;
    }
    if (!this.domain.openRouterKey?.trim()) {
      this.showToast("Add your OpenRouter key in Settings");
      return;
    }

    const history = this.parseChat(card.body);
    history.push({ role: "user", content: text });
    history.push({ role: "assistant", content: "" });
    const assistantIdx = history.length - 1;
    await this.writeChat(cardId, history, true);

    this.ui.chatStreamingCardId = cardId;
    this.emit();

    const requestMessages: ChatMessage[] = [
      { role: "system", content: this.buildChatContext(card) },
      ...history.slice(0, assistantIdx), // everything up to (not incl.) the empty assistant
    ];

    try {
      await this.agentGateway.streamChat(
        requestMessages,
        this.domain.openRouterKey,
        this.domain.selectedModel,
        (delta) => {
          history[assistantIdx].content += delta;
          // Update in-memory + emit for a live feed; persistence happens once at the end.
          void this.writeChat(cardId, history, false);
        }
      );
      await this.writeChat(cardId, history, true);
    } catch (err: any) {
      history[assistantIdx].content += `\n\n_[error: ${err?.message || "stream failed"}]_`;
      await this.writeChat(cardId, history, true);
      this.showToast("Chat failed");
    } finally {
      this.ui.chatStreamingCardId = null;
      this.emit();
    }
  }

  // --- Search & Extraction ---

  async extractUrlToCard(url: string, title: string, parentId?: string, sourceCardIdForGrouping?: string): Promise<void> {
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
        const sourceCard = this.domain.cards.find(c => c.id === sourceCardIdForGrouping);
        if (sourceCard) {
          const group = await this.groupCardsInteractor.execute({
            workspaceId,
            parentId: sourceCard.parentId || null,
            name: "Related Sources",
            cards: [sourceCard, card]
          });
          finalParentId = group.id;
        }
      }

      this.domain.selection = new Set([card.id]);
      await this.loadCardsForActiveWorkspace();
      this.removePendingOperation(opId);
      this.showToast(finalParentId ? "Extracted to related group" : "Extracted to new card");
      console.log(`[${logTimestamp}] [LearnimalController.extractUrlToCard] SUCCESS | cardId=${card.id}`);
    } catch (err: any) {
      console.error(`[${logTimestamp}] [LearnimalController.extractUrlToCard] ERROR: ${err.message}`);
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
      autoGroupByCommand: this.domain.autoGroupByCommand,
      interleaveReviews: this.domain.interleaveReviews,
      searchSiteFlags: this.domain.searchSiteFlags,
    };
  }

  private async saveCurrentSettings(): Promise<void> {
    const logTimestamp = new Date().toISOString();
    try {
      await this.saveSettingsInteractor.execute(this.currentSettings());
      console.log(`[${logTimestamp}] [LearnimalController.saveCurrentSettings] SUCCESS`);
    } catch (err: any) {
      console.error(`[${logTimestamp}] [LearnimalController.saveCurrentSettings] ERROR: ${err.message}`);
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
    this.domain.activeWorkspaceId = workspaceId;
    this.domain.currentGroupId = null;
    this.domain.selection.clear();
    this.ui.isWorkspaceSheetOpen = false;
    this.domain.cards = await this.switchWorkspaceInteractor.execute(workspaceId);
    this.emit();
  }

  async deleteActiveWorkspace(): Promise<void> {
    if (!this.domain.activeWorkspaceId) return;
    const toDeleteId = this.domain.activeWorkspaceId;

    await this.deleteWorkspaceInteractor.execute(toDeleteId);
    this.domain.workspaces = this.domain.workspaces.filter(w => w.id !== toDeleteId);
    this.domain.currentGroupId = null;

    if (this.domain.workspaces.length > 0) {
      this.domain.activeWorkspaceId = this.domain.workspaces[0].id;
      await this.loadCardsForActiveWorkspace();
    } else {
      const defaultWs = await this.createWorkspaceInteractor.execute("My Workspace");
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
    retry?: { inputCardIds: string[]; parentId: string | null }
  ): Promise<void> {
    const logTimestamp = new Date().toISOString();
    console.log(`[${logTimestamp}] [LearnimalController.runPipeline] Running: "${pipelineText}"`);

    const workspaceId = this.domain.activeWorkspaceId;
    if (!workspaceId) {
      this.showToast("Create a workspace first");
      return;
    }

    this.ui.isModalOpen = false;
    this.ui.isInputSheetOpen = false;
    this.emit();

    // Resolve the input context: a retry restores the original selection/group;
    // otherwise expand the current selection so piping a group feeds its descendants.
    const targetParentId = retry ? retry.parentId : this.domain.currentGroupId;
    const initialInputCards = retry
      ? this.domain.cards.filter(c => retry.inputCardIds.includes(c.id))
      : expandForPipe(this.domain.cards, this.domain.selection);

    const opId = this.addPendingOperation(pipelineText, {
      pipelineText,
      inputCardIds: initialInputCards.map(c => c.id),
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
        autoGroup: this.domain.autoGroupByCommand,
      });

      this.removePendingOperation(opId);

      if (outcome.kind === "needsInput") {
        this.ui.pendingCommandName = outcome.command;
        this.setInputSheetOpen(true, outcome.mode);
        return;
      }
      if (outcome.kind === "review") {
        this.startReview();
        return;
      }

      this.domain.selection = new Set(outcome.cards.map(c => c.id));
      await this.loadCardsForActiveWorkspace();
      if (outcome.cards.length > 0) {
        this.showToast(`${outcome.cards.length} cards ready. Open drawer to pipe.`);
      }
    } catch (err: any) {
      console.error(`[${logTimestamp}] [LearnimalController.runPipeline] ERROR: ${err.message}`);
      const errorMessage = err instanceof UseCaseError ? err.userMessage : "Pipeline failed";
      this.setPendingOperationError(opId, errorMessage);
      this.showToast(errorMessage);
    }
  }

  public addPendingOperation(
    commandName: string,
    retry?: { pipelineText: string; inputCardIds: string[]; parentId: string | null }
  ): string {
    const id = Math.random().toString(36).substring(2, 9);
    this.ui.pendingOperations = [
      ...this.ui.pendingOperations,
      { id, commandName, status: "loading", ...retry }
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
    const op = this.ui.pendingOperations.find(o => o.id === opId);
    if (!op) return;
    const text = op.pipelineText ?? op.commandName;
    const retry = op.inputCardIds !== undefined
      ? { inputCardIds: op.inputCardIds, parentId: op.parentId ?? null }
      : undefined;
    this.removePendingOperation(opId);
    await this.runPipeline(text, retry);
  }

  public setPendingOperationError(id: string, errorMessage: string): void {
    this.ui.pendingOperations = this.ui.pendingOperations.map(op =>
      op.id === id ? { ...op, status: "error", errorMessage } : op
    );
    this.emit();
  }

  public removePendingOperation(id: string): void {
    this.ui.pendingOperations = this.ui.pendingOperations.filter(op => op.id !== id);
    this.emit();
  }

  // --- Spaced Repetition Review Flow ---

  startReview(): void {
    const logTimestamp = new Date().toISOString();
    try {
      const queue = this.startReviewInteractor.execute(this.domain.cards, Date.now(), this.domain.interleaveReviews);
      this.domain.reviewQueue = queue;
      this.domain.reviewIndex = 0;
      this.ui.isReviewOpen = true;
      this.ui.reviewRevealAnswer = false;
      this.emit();
      console.log(`[${logTimestamp}] [LearnimalController.startReview] Started review with ${queue.length} cards`);
    } catch (err: any) {
      console.log(`[${logTimestamp}] [LearnimalController.startReview] Halted: ${err.message}`);
      this.showToast(err instanceof UseCaseError ? err.userMessage : "Could not start review");
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

    const updated = await this.gradeReviewInteractor.execute(currentCard, grade, Date.now());
    if (!updated) return;

    const nextIndex = this.domain.reviewIndex + 1;
    if (nextIndex >= this.domain.reviewQueue.length) {
      this.ui.isReviewOpen = false;
      this.domain.reviewQueue = [];
      this.domain.reviewIndex = 0;
      this.ui.reviewRevealAnswer = false;
      await this.loadCardsForActiveWorkspace();
      this.showToast("Review complete!");
      console.log(`[${logTimestamp}] [LearnimalController.gradeReview] Finished review session`);
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
      console.log(`[${logTimestamp}] [LearnimalController.loadAvailableModels] SUCCESS | count=${this.domain.availableModels.length}`);
    } catch (err: any) {
      console.error(`[${logTimestamp}] [LearnimalController.loadAvailableModels] ERROR: ${err.message}`);
    } finally {
      this.ui.isLoadingModels = false;
      this.emit();
    }
  }


  // --- Internal Utilities ---

  private async loadCardsForActiveWorkspace(): Promise<void> {
    if (this.domain.activeWorkspaceId) {
      this.domain.cards = await this.cardRepo.getCardsByWorkspace(this.domain.activeWorkspaceId);
    } else {
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
