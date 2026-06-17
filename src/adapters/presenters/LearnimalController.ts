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
import { StartReviewInteractor } from "../../usecases/review/StartReviewInteractor";
import { GradeReviewInteractor } from "../../usecases/review/GradeReviewInteractor";
import { CreateWorkspaceInteractor } from "../../usecases/workspace/CreateWorkspaceInteractor";
import { SwitchWorkspaceInteractor } from "../../usecases/workspace/SwitchWorkspaceInteractor";
import { DeleteWorkspaceInteractor } from "../../usecases/workspace/DeleteWorkspaceInteractor";
import { RestartOnboardingInteractor } from "../../usecases/onboarding/RestartOnboardingInteractor";
import { CompleteOnboardingInteractor } from "../../usecases/onboarding/CompleteOnboardingInteractor";
import { SaveSettingsInteractor } from "../../usecases/settings/SaveSettingsInteractor";
import { LoadModelsInteractor } from "../../usecases/models/LoadModelsInteractor";

const DEFAULT_SYSTEM_PROMPT = `You generate atomic learning cards. Respond ONLY with a valid JSON array of objects (no prose, no markdown code block formatting). Each object must have:
- "title": string (max 6 words, representing the atomic concept)
- "body": string (1-2 clear, simple sentences explaining the concept)

Each card must be a distinct, recall-ready idea.`;

const DEFAULT_MODELS: AgentModel[] = [
  { id: "google/gemini-2.5-flash:free", name: "Gemini 2.5 Flash (Free)", free: true },
  { id: "meta-llama/llama-3.1-8b-instruct:free", name: "Llama 3.1 8B (Free)", free: true },
  { id: "qwen/qwen-2.5-72b-instruct:free", name: "Qwen 2.5 72B (Free)", free: true },
  { id: "openchat/openchat-7b:free", name: "OpenChat 7B (Free)", free: true },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", free: false },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", free: false },
  { id: "meta-llama/llama-3.1-405b-instruct", name: "Llama 3.1 405B", free: false },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", free: false },
];

/**
 * # Learnimal Application State Model
 *
 * The public ViewModel consumed by the UI. It is composed from the controller's
 * internal {@link DomainState} (business data) and {@link UiState} (ephemeral
 * presentation flags) — see {@link LearnimalController.getState}.
 */
export interface AppState {
  theme: "dark" | "light";
  accent: "teal" | "lilac" | "amber" | "rose" | "arctic";
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  cards: Card[];
  selection: Set<string>;
  pinnedCommands: string[];
  onboarded: boolean;
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
  onboardingStep: number;
  onboardingAnswers: string[];
  isOnboardingOpen: boolean;
  toastMessage: string;
  openRouterKey: string;
  selectedModel: string;
  customSystemPrompt: string;
  availableModels: AgentModel[];
  isLoadingModels: boolean;
}

/** Business/domain state: persisted or derivable data, free of UI concerns. */
interface DomainState {
  theme: "dark" | "light";
  accent: "teal" | "lilac" | "amber" | "rose" | "arctic";
  openRouterKey: string;
  selectedModel: string;
  customSystemPrompt: string;
  availableModels: AgentModel[];
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  cards: Card[];
  selection: Set<string>;
  pinnedCommands: string[];
  onboarded: boolean;
  onboardingStep: number;
  onboardingAnswers: string[];
  reviewQueue: Card[];
  reviewIndex: number;
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
  isOnboardingOpen: boolean;
  toastMessage: string;
  isLoadingModels: boolean;
}

export interface LearnimalControllerDeps {
  cardRepo: CardRepository;
  workspaceRepo: WorkspaceRepository;
  settingsRepo: SettingsRepository;
  agentGateway: AgentGateway;
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

  private pipeline: PipelineRunner;
  private startReviewInteractor: StartReviewInteractor;
  private gradeReviewInteractor: GradeReviewInteractor;
  private createWorkspaceInteractor: CreateWorkspaceInteractor;
  private switchWorkspaceInteractor: SwitchWorkspaceInteractor;
  private deleteWorkspaceInteractor: DeleteWorkspaceInteractor;
  private restartOnboardingInteractor: RestartOnboardingInteractor;
  private completeOnboardingInteractor: CompleteOnboardingInteractor;
  private saveSettingsInteractor: SaveSettingsInteractor;
  private loadModelsInteractor: LoadModelsInteractor;

  private domain: DomainState;
  private ui: UiState;
  private listeners: Set<(state: AppState) => void> = new Set();

  constructor(deps: LearnimalControllerDeps) {
    this.cardRepo = deps.cardRepo;
    this.workspaceRepo = deps.workspaceRepo;
    this.settingsRepo = deps.settingsRepo;

    // Compose use-case interactors from the injected ports.
    this.pipeline = new PipelineRunner([
      new AskCommand(deps.agentGateway, deps.cardRepo),
      new SourceCommand(deps.cardRepo),
      new ChunkCommand(deps.cardRepo),
      new RecallCommand(deps.cardRepo),
      new SpaceCommand(deps.cardRepo),
      new MoveCommand(deps.cardRepo),
      new ReviewCommand(),
    ]);
    this.startReviewInteractor = new StartReviewInteractor();
    this.gradeReviewInteractor = new GradeReviewInteractor(deps.cardRepo);
    this.createWorkspaceInteractor = new CreateWorkspaceInteractor(deps.workspaceRepo);
    this.switchWorkspaceInteractor = new SwitchWorkspaceInteractor(deps.cardRepo);
    this.deleteWorkspaceInteractor = new DeleteWorkspaceInteractor(deps.workspaceRepo, deps.cardRepo);
    this.restartOnboardingInteractor = new RestartOnboardingInteractor(deps.workspaceRepo, deps.cardRepo);
    this.completeOnboardingInteractor = new CompleteOnboardingInteractor(
      deps.workspaceRepo,
      deps.cardRepo,
      deps.settingsRepo,
      deps.agentGateway
    );
    this.saveSettingsInteractor = new SaveSettingsInteractor(deps.settingsRepo);
    this.loadModelsInteractor = new LoadModelsInteractor(deps.agentGateway);

    this.domain = {
      theme: "dark",
      accent: "teal",
      openRouterKey: "",
      selectedModel: "google/gemini-2.5-flash",
      customSystemPrompt: DEFAULT_SYSTEM_PROMPT,
      availableModels: [...DEFAULT_MODELS],
      workspaces: [],
      activeWorkspaceId: null,
      cards: [],
      selection: new Set(),
      pinnedCommands: ["ask", "chunk", "recall", "space", "review"],
      onboarded: false,
      onboardingStep: 0,
      onboardingAnswers: [],
      reviewQueue: [],
      reviewIndex: 0,
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
      isOnboardingOpen: true,
      toastMessage: "",
      isLoadingModels: false,
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
        this.domain.selectedModel = settings.selectedModel || "google/gemini-2.5-flash";
        this.domain.customSystemPrompt = settings.customSystemPrompt || DEFAULT_SYSTEM_PROMPT;
      } else {
        this.domain.customSystemPrompt = DEFAULT_SYSTEM_PROMPT;
      }

      if (this.domain.workspaces.length > 0) {
        this.domain.onboarded = true;
        this.ui.isOnboardingOpen = false;
        this.domain.activeWorkspaceId = this.domain.workspaces[0].id;
        await this.loadCardsForActiveWorkspace();
      } else {
        this.domain.onboarded = false;
        this.ui.isOnboardingOpen = true;
      }
      this.loadAvailableModels();
      this.emit();
      console.log(`[${logTimestamp}] [LearnimalController.init] SUCCESS | onboarded=${this.domain.onboarded}`);
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
      selection: new Set(this.domain.selection),
      pinnedCommands: [...this.domain.pinnedCommands],
      onboarded: this.domain.onboarded,
      reviewQueue: [...this.domain.reviewQueue],
      reviewIndex: this.domain.reviewIndex,
      onboardingStep: this.domain.onboardingStep,
      onboardingAnswers: [...this.domain.onboardingAnswers],
      openRouterKey: this.domain.openRouterKey,
      selectedModel: this.domain.selectedModel,
      customSystemPrompt: this.domain.customSystemPrompt,
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
      isOnboardingOpen: this.ui.isOnboardingOpen,
      toastMessage: this.ui.toastMessage,
      isLoadingModels: this.ui.isLoadingModels,
    };
  }

  // --- Onboarding Flow ---

  /**
   * Submits an answer for the current onboarding question and advances the flow.
   */
  async answerOnboardingQuestion(answer: string): Promise<void> {
    const logTimestamp = new Date().toISOString();
    const cleanAnswer = answer.trim();

    this.domain.onboardingAnswers.push(cleanAnswer);
    const nextStep = this.domain.onboardingStep + 1;

    console.log(`[${logTimestamp}] [LearnimalController.answerOnboardingQuestion] step=${this.domain.onboardingStep} -> answer="${cleanAnswer}"`);

    if (nextStep >= 5) {
      await this.finishOnboarding();
    } else {
      this.domain.onboardingStep = nextStep;
      this.emit();
    }
  }

  async skipOnboarding(): Promise<void> {
    const logTimestamp = new Date().toISOString();
    console.log(`[${logTimestamp}] [LearnimalController.skipOnboarding] Skipping remaining onboarding steps.`);

    const defaults = [
      "",                  // Step 0: API Key (default empty if not entered)
      "My learning goal",  // Step 1: Topic
      "curiosity",         // Step 2: Why
      "experiment",        // Step 3: What to do
      "basics",            // Step 4: What to learn first
    ];

    for (let i = 0; i < 5; i++) {
      if (this.domain.onboardingAnswers[i] === undefined || this.domain.onboardingAnswers[i] === "") {
        this.domain.onboardingAnswers[i] = defaults[i];
      }
    }

    await this.finishOnboarding();
  }

  private async finishOnboarding(): Promise<void> {
    const logTimestamp = new Date().toISOString();
    const answers = this.domain.onboardingAnswers;
    const topic = answers[1] || "My first topic";
    const apiKey = answers[0] || "";
    const prompt = answers[4] || answers[1];

    // Close onboarding immediately so the user sees the workspace being built.
    this.domain.openRouterKey = apiKey;
    this.domain.onboarded = true;
    this.ui.isOnboardingOpen = false;
    this.domain.selection.clear();
    this.showToast(`Creating "${topic.substring(0, 22)}"…`);

    try {
      const { workspace, cards } = await this.completeOnboardingInteractor.execute({
        topic,
        prompt,
        settings: this.currentSettings(),
      });

      this.domain.workspaces.push(workspace);
      this.domain.activeWorkspaceId = workspace.id;
      this.domain.selection = new Set(cards.map(c => c.id));
      await this.loadCardsForActiveWorkspace();

      this.showToast("First cards generated! Pipe into recall.");
      console.log(`[${logTimestamp}] [LearnimalController.finishOnboarding] SUCCESS | wsId=${workspace.id}`);
    } catch (err: any) {
      console.error(`[${logTimestamp}] [LearnimalController.finishOnboarding] ERROR: ${err.message}`);
      this.showToast(err instanceof UseCaseError ? err.userMessage : "Onboarding setup failed");
    }
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

  private currentSettings(): AppSettings {
    return {
      theme: this.domain.theme,
      accent: this.domain.accent,
      openRouterKey: this.domain.openRouterKey,
      selectedModel: this.domain.selectedModel,
      customSystemPrompt: this.domain.customSystemPrompt,
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
    this.domain.selection.clear();
    this.ui.isWorkspaceSheetOpen = false;
    await this.loadCardsForActiveWorkspace();
    this.showToast(`Created workspace: ${ws.name}`);
  }

  async switchWorkspace(workspaceId: string): Promise<void> {
    this.domain.activeWorkspaceId = workspaceId;
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

    if (this.domain.workspaces.length > 0) {
      this.domain.activeWorkspaceId = this.domain.workspaces[0].id;
      await this.loadCardsForActiveWorkspace();
    } else {
      this.domain.activeWorkspaceId = null;
      this.domain.cards = [];
      this.domain.onboarded = false;
      this.ui.isOnboardingOpen = true;
      this.domain.onboardingStep = 0;
      this.domain.onboardingAnswers = [];
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
  async runPipeline(pipelineText: string): Promise<void> {
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

    const initialInputCards = Array.from(this.domain.selection)
      .map(id => this.domain.cards.find(c => c.id === id))
      .filter((c): c is Card => !!c);

    try {
      const outcome = await this.pipeline.run(pipelineText, {
        workspaceId,
        initialInputCards,
        workspaces: this.domain.workspaces,
        apiKey: this.domain.openRouterKey,
        model: this.domain.selectedModel,
        systemPrompt: this.domain.customSystemPrompt,
      });

      if (outcome.kind === "needsInput") {
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
      this.showToast(err instanceof UseCaseError ? err.userMessage : "Pipeline failed");
    }
  }

  // --- Spaced Repetition Review Flow ---

  startReview(): void {
    const logTimestamp = new Date().toISOString();
    try {
      const queue = this.startReviewInteractor.execute(this.domain.cards, Date.now());
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

  async gradeReview(ok: boolean): Promise<void> {
    const logTimestamp = new Date().toISOString();
    const currentCard = this.domain.reviewQueue[this.domain.reviewIndex];
    if (!currentCard) return;

    const updated = await this.gradeReviewInteractor.execute(currentCard, ok, Date.now());
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

  /**
   * Clears all workspaces and cards from local storage and restarts onboarding.
   */
  async restartOnboarding(): Promise<void> {
    const logTimestamp = new Date().toISOString();
    try {
      await this.restartOnboardingInteractor.execute();
      this.domain.workspaces = [];
      this.domain.activeWorkspaceId = null;
      this.domain.cards = [];
      this.domain.selection.clear();
      this.domain.onboarded = false;
      this.ui.isOnboardingOpen = true;
      this.domain.onboardingStep = 0;
      this.domain.onboardingAnswers = [];
      this.emit();
      console.log(`[${logTimestamp}] [LearnimalController.restartOnboarding] SUCCESS`);
      this.showToast("Onboarding restarted");
    } catch (err: any) {
      console.error(`[${logTimestamp}] [LearnimalController.restartOnboarding] ERROR: ${err.message}`);
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
