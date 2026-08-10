import { Card } from "../../entities/card";
import { Workspace } from "../../entities/workspace";
import { Roundtable } from "../../entities/roundtable";
import { AppearanceSettings } from "../../entities/appearance";
import { AgentPromptOverrides } from "../../entities/agentPrompts";
import { FontCategory, RankedFontFamily } from "../../entities/fontCatalog";
import { CommandDefinition } from "../../entities/commandDefinition";
import {
  BUILTIN_CARD_TYPES,
  CardTypeDefinition,
} from "../../entities/cardTypeDefinition";
import {
  BUILTIN_PROMPT_PRESETS,
  DEFAULT_CARD_INSTRUCTION,
  DEFAULT_CHUNK_INSTRUCTION,
  PromptPreset,
} from "../../entities/promptPreset";
import {
  AssistantCapability,
  AssistantProfile,
  BUILTIN_ASSISTANT_PROFILES,
} from "../../entities/assistantProfile";
import { AgentModel } from "../../usecases/ports/gateways/AgentGateway";

/**
 * # App Session Store
 *
 * ## Business Value & Purpose
 * One place that holds what the running app currently knows, and one way to tell the UI
 * it changed. Before this existed, state, subscription bookkeeping, and the toast timer
 * were mixed in among the controller's feature methods, which meant every extracted
 * workflow needed a bespoke callback just to say "something changed".
 *
 * The split it enforces matters: `domain` is data that is persisted or derived from
 * persisted data, `ui` is what is currently on screen. Anything in `ui` can be thrown
 * away on relaunch without the user losing work.
 */

/** Business/domain state: persisted or derivable data, free of UI concerns. */
export interface DomainState {
  theme: "dark" | "light";
  accent: "teal" | "lilac" | "amber" | "rose" | "arctic";
  /** Palette and typeface customisation (see `entities/appearance.ts`). */
  appearance: AppearanceSettings;
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
  roundtables: Roundtable[];
  activeProfileIds: Partial<Record<AssistantCapability, string>>;
  searchSiteFlags: Record<string, string>;
  /** User-edited agent prompt bodies (see `entities/agentPrompts.ts`). Empty = all defaults. */
  agentPromptOverrides: AgentPromptOverrides;
  /** Whether the provider's own web search rides along with agent calls. Defaults on. */
  webSearchEnabled: boolean;
}

/** Ephemeral presentation state: open sheets, toasts, and transient toggles. */
export interface UiState {
  openCardId: string | null;
  pinEditMode: boolean;
  isModalOpen: boolean;
  isWorkspaceSheetOpen: boolean;
  isSettingsSheetOpen: boolean;
  /** Capture is a floating modal, not a routed place — see `openCaptureSheet`/`closeCaptureSheet`. */
  isCaptureSheetOpen: boolean;
  /**
   * Whether the Ask GRIOT `Modal` window itself is showing — separate from
   * `WorkspaceAgentState.isOpen`, which means "there is a live conversation" (sends work,
   * persistence runs) and stays true for a think tank convened on the Bridge board, which
   * deliberately never raises this flag. Two questions, two flags: is there a
   * conversation, and is a modal window currently drawn over the screen for it.
   */
  isAskGriotSheetOpen: boolean;
  isInputSheetOpen: boolean;
  inputSheetMode: "source" | "ask" | "note";
  activePreflightPresetId: string | null;
  preflightQuery: string;
  aiQuerySuggestions: string[];
  isSuggestingQueries: boolean;
  /** Id of the card the "ask GRIOT what's next" suggestion is for, or null when idle. */
  suggestedActionForCardId: string | null;
  suggestedActionId: string | null;
  suggestedActionReason: string | null;
  isSuggestingNextAction: boolean;
  suggestedActionError: string | null;
  captureIntent: "note" | "paste" | "link" | "ask" | null;
  pendingGroupNavigation: string | null;
  /**
   * The table the Bridge's inline think-tank board is currently showing, or null when
   * none has been convened yet. Unlike a consume-once signal, this simply *is* the
   * board's state — set by {@link GriotController.conveneThinkTank}, cleared by
   * {@link GriotController.dismissThinkTank}, and otherwise left alone so the board keeps
   * showing the same table across re-renders.
   */
  activeThinkTankRoundtableId: string | null;
  isInstallingFont: boolean;
  /** Font-browser query, filter, results, and load state — see the controller's search. */
  fontQuery: string;
  fontCategory: FontCategory | null;
  fontResults: RankedFontFamily[];
  isSearchingFonts: boolean;
  fontCatalogError: string | null;
  /** Families whose real typeface has loaded and may be rendered in a preview. */
  previewedFontFamilies: string[];
  /** Set when storage could not be read; the library is unknown, not empty. */
  storageError: string | null;
  pendingCommandName: string;
  toastMessage: string;
  isLoadingModels: boolean;
  chatStreamingCardId: string | null;
  // Research, mission, review, and in-flight operation state deliberately absent: each
  // belongs to its own workflow, which the projector reads from directly.
}

export const DEFAULT_SYSTEM_PROMPT = DEFAULT_CARD_INSTRUCTION;
export const DEFAULT_CHUNK_SYSTEM_PROMPT = DEFAULT_CHUNK_INSTRUCTION;

/** How long a toast stays up before clearing itself. */
const TOAST_DURATION_MS = 2500;

export function createInitialDomainState(): DomainState {
  return {
    theme: "dark",
    accent: "teal",
    appearance: {},
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
    pinnedCommands: ["ask", "search", "chunk", "split", "recall", "space", "review"],
    autoGroupByCommand: true,
    interleaveReviews: true,
    commandDefinitions: [],
    cardTypes: [...BUILTIN_CARD_TYPES],
    promptPresets: [...BUILTIN_PROMPT_PRESETS],
    assistantProfiles: [...BUILTIN_ASSISTANT_PROFILES],
    roundtables: [],
    agentPromptOverrides: {},
    webSearchEnabled: true,
    activeProfileIds: {
      "generate-cards": "builtin-generate-cards",
      "chunk-document": "builtin-chunk-document",
      chat: "builtin-chat",
      cloze: "builtin-cloze",
    },
    searchSiteFlags: {
      wiki: "wikipedia.org",
      nature: "nature.com",
    },
  };
}

export function createInitialUiState(): UiState {
  return {
    openCardId: null,
    pinEditMode: false,
    isModalOpen: false,
    isWorkspaceSheetOpen: false,
    isSettingsSheetOpen: false,
    isCaptureSheetOpen: false,
    isAskGriotSheetOpen: false,
    isInputSheetOpen: false,
    inputSheetMode: "source",
    activePreflightPresetId: null,
    preflightQuery: "",
    aiQuerySuggestions: [],
    isSuggestingQueries: false,
    suggestedActionForCardId: null,
    suggestedActionId: null,
    suggestedActionReason: null,
    isSuggestingNextAction: false,
    suggestedActionError: null,
    captureIntent: null,
    pendingGroupNavigation: null,
    activeThinkTankRoundtableId: null,
    isInstallingFont: false,
    fontQuery: "",
    fontCategory: null,
    fontResults: [],
    isSearchingFonts: false,
    fontCatalogError: null,
    previewedFontFamilies: [],
    storageError: null,
    pendingCommandName: "",
    toastMessage: "",
    isLoadingModels: false,
    chatStreamingCardId: null,
  };
}

/**
 * Holds the session's state and broadcasts changes.
 *
 * @typeParam TSnapshot The render-ready view model listeners receive; the owner supplies
 * a projector so the store never has to know how the view model is composed.
 */
export class AppSessionStore<TSnapshot> {
  readonly domain: DomainState = createInitialDomainState();
  readonly ui: UiState = createInitialUiState();

  private readonly listeners = new Set<(snapshot: TSnapshot) => void>();

  constructor(private readonly project: () => TSnapshot) {}

  subscribe(listener: (snapshot: TSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.project());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Projects once and hands the same snapshot to every listener. */
  emit(): void {
    const snapshot = this.project();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  /** Shows a transient message, which clears itself unless something newer replaced it. */
  showToast(message: string): void {
    this.ui.toastMessage = message;
    this.emit();

    setTimeout(() => {
      if (this.ui.toastMessage === message) {
        this.ui.toastMessage = "";
        this.emit();
      }
    }, TOAST_DURATION_MS);
  }

  // --- Cohesive state edits shared by more than one feature ---

  /** Replaces the selection wholesale. */
  select(cardIds: Iterable<string>): void {
    this.domain.selection = new Set(cardIds);
  }

  /**
   * Drops cards that no longer exist from everywhere they could still be referenced —
   * the selection, the open card, and the group the user is standing in. Called after a
   * deletion or an undo, so the app can never point at something that isn't there.
   */
  forgetCards(removedCardIds: Iterable<string>): void {
    const removed = new Set(removedCardIds);
    if (removed.size === 0) return;

    this.domain.selection = new Set(
      [...this.domain.selection].filter((id) => !removed.has(id)),
    );
    if (this.ui.openCardId && removed.has(this.ui.openCardId)) {
      this.ui.openCardId = null;
    }
    if (this.domain.currentGroupId && removed.has(this.domain.currentGroupId)) {
      this.domain.currentGroupId = null;
    }
  }
}
