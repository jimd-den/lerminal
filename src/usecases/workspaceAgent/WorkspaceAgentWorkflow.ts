import { Card } from "../../entities/card";
import { AgentToolIntent } from "../../entities/workspaceAgent";
import {
  AgentMessageSegment,
  ParsedAgentTag,
  parseAgentTags,
} from "../../entities/agentTags";
import { AgentGateway } from "../ports/gateways/AgentGateway";
import { ConversationRepository } from "../ports/repositories/ConversationRepository";
import {
  Conversation,
  ConversationMessage,
  ConversationTagAction,
  createConversation,
  isWorthSaving,
  sortByRecency,
  withMessages,
} from "../../entities/conversation";
import { WebCitation } from "../../entities/webCitation";
import { resolveScopedContext } from "../agent/AgentScope";

/**
 * # Workspace Agent Workflow — a streamed conversation with taggable artifacts
 *
 * ## Business Value & Purpose
 * Owns the "Ask GRIOT" conversation sheet's state: is it open, for which
 * workspace/selection, what has been said, and what the reply offered to create.
 *
 * The model no longer returns a JSON envelope of "proposed actions". It writes prose and
 * embeds tags (`entities/agentTags`), which the app parses into the same closed
 * `AgentToolIntent` vocabulary the dispatcher and interactors already speak. What changed
 * is only how an intent is *produced* — and, crucially, that the reply now arrives
 * **progressively**: text and the model's own reasoning are accumulated token by token
 * into an assistant message that exists in state while it is still being written.
 *
 * ## The one invariant that did not change
 * Nothing is created by a reply. A tag is a chip with a `+`; only {@link addTag} — the
 * user's explicit tap — reaches `dispatchTool`, and it is the only method that ever calls
 * it. Parsing a tag is not acting on it.
 *
 * ## The failure discipline
 * No API key, no gateway support, or a network failure sets `agentError` and leaves
 * everything else untouched. A stream that dies mid-way discards the half-written reply
 * rather than presenting a truncated one as an answer — and creates nothing either way.
 *
 * ## Conversations are saved now
 * Messages used to be session-only. They are persisted per workspace instead, because the
 * conversation is where a vague goal actually gets sharpened and losing it on a stray tap
 * loses the thinking. Saving happens at the three points where something real changed —
 * the user sent a message, a turn finished, a tag settled — so a crash costs at most the
 * turn in flight.
 *
 * What is stored is the model's **raw** text, tags and all (see `entities/conversation`),
 * so a restored transcript re-parses into the same chips it had live. Tag outcomes ride
 * along, which is what stops a restored conversation from offering a fresh `+` on a note
 * whose card already exists.
 */

/**
 * Exactly what left the device for one turn — the audit record behind the sheet's
 * "what was sent" disclosure.
 *
 * Recorded at send time from the same values the request was built from (never
 * reconstructed afterwards from current state), so the disclosure cannot over-claim or
 * under-claim: `cardIds` is the scoped set that really appears in `briefing`, `focusCardIds`
 * is the subset marked `[focus]`, and `briefing` is the verbatim user message body.
 */
export interface WorkspaceAgentSentContext {
  /** The group the conversation was scoped to, or null for the workspace root. */
  groupId: string | null;
  /** Every card id included in the briefing, in the order it was sent. */
  cardIds: string[];
  /** The subset the user had open/selected — marked `[focus]` in the briefing. */
  focusCardIds: string[];
  /** The verbatim briefing text sent as the user message. */
  briefing: string;
}

/**
 * One voice in the conversation: a name, the model that speaks it, and the behaviour body
 * that shapes it.
 *
 * The workflow deliberately knows nothing about `AssistantProfile` — the controller maps
 * chat-capability profiles down to this, resolving each one's pinned model first. What
 * reaches here is only what a turn actually needs, which keeps "who is talking" a
 * conversation concept rather than a settings one.
 */
export interface WorkspaceAgentPersona {
  id: string;
  name: string;
  /** Already resolved: the persona's pinned model, or the app's current selection. */
  model: string;
  /**
   * The persona's behaviour body, replacing the user's `workspace-agent` body for this
   * turn. Undefined means "speak as plain GRIOT". Only the *body* — the parent rules and
   * the tag contract are appended downstream either way, so a persona can change the
   * voice and never the trust boundary or what the app can parse.
   */
  systemPrompt?: string;
}

/** The always-present first voice: the user's own `workspace-agent` prompt, unmodified. */
export const DEFAULT_PERSONA_ID = "griot";

/** One line of the conversation. `pending` marks a user message with no reply yet. */
export interface WorkspaceAgentMessage {
  id: string;
  speaker: "user" | "assistant";
  text: string;
  createdAt: number;
  /** True for a just-sent user message while its reply is still in flight. */
  pending?: boolean;
  /**
   * Who said it and on what model. Assistant messages only, and recorded from the persona
   * the turn was actually sent as — never relabelled afterwards, so a transcript with
   * three voices in it stays honest about which one said what, even after the user
   * switches personas or re-pins a model.
   */
  personaId?: string;
  personaName?: string;
  model?: string;
  /**
   * Sources the model's provider actually consulted for *this* reply — the receipts.
   *
   * Attached to the message rather than held once per conversation so a later turn that
   * consulted nothing cannot inherit an earlier turn's sources. Present only when real
   * citations came back; never derived from the web-search toggle.
   */
  webCitations?: WebCitation[];
  /**
   * The bounded context that produced this reply. Set on assistant messages only, and
   * only from the values actually sent — see {@link WorkspaceAgentSentContext}.
   */
  sentContext?: WorkspaceAgentSentContext;
  /**
   * The model's own intermediate thinking for this reply, when the provider returned
   * any. Absent for the overwhelming majority of models, and never filled in from the
   * answer: no reasoning means no reasoning UI, not a placeholder.
   */
  reasoning?: string;
  /**
   * The reply split into prose and tags, re-parsed on every streamed update.
   *
   * Assistant messages only. Prose with no tags — the overwhelmingly common case for a
   * small model — yields a single text segment and renders as plain conversation.
   */
  segments?: AgentMessageSegment[];
  /**
   * True while tokens are still arriving for this message. The sheet renders the partial
   * text live; it never fabricates one, so a gateway that cannot stream simply leaves
   * this false and the message appears complete when it appears at all.
   */
  streaming?: boolean;
  /**
   * The reply exactly as the model wrote it, tags and all — the string {@link segments}
   * was parsed from. Kept so persistence stores the source rather than the rendering, and
   * a conversation reopened from history re-parses into the same chips it had live.
   */
  rawText?: string;
}

/**
 * What has happened to one tag's `+`. Keyed `messageId:tagId` in
 * {@link WorkspaceAgentState.tagActions}; absent means untouched, which is the only state
 * in which anything can be dispatched.
 */
export interface WorkspaceAgentTagAction {
  status: "pending" | "done" | "failed";
  /** Truthful, factual outcome once the dispatch settles. */
  resultMessage?: string;
}

/**
 * What the conversation is scoped to *right now* — informs the context chips and the
 * bounded briefing.
 *
 * This is deliberately re-read from the host on every projection and every send, rather
 * than captured when the sheet opened: the user can change their selection, open or close
 * a card, or navigate into a group while the sheet is up, and the agent must talk about
 * what is on screen, not about what was on screen when they tapped "Ask GRIOT".
 */
export interface WorkspaceAgentContext {
  selectedCardIds: string[];
  currentGroupId: string | null;
  /** The card open in the detail modal, if any — the "explain this" focus card. */
  openCardId?: string | null;
}

/**
 * The card ids actually put in front of the model, highest priority first: the open card
 * (the thing the user is looking at) then the multi-selection, de-duplicated. This is the
 * single source of truth for both the briefing and the context chips, so the chips can
 * never claim context that isn't being sent.
 */
export function contextCardIds(context: WorkspaceAgentContext): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (id: string | null | undefined) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  push(context.openCardId);
  for (const id of context.selectedCardIds) push(id);
  return ids;
}

function sameContext(a: WorkspaceAgentContext, b: WorkspaceAgentContext): boolean {
  return (
    a.currentGroupId === b.currentGroupId &&
    (a.openCardId ?? null) === (b.openCardId ?? null) &&
    a.selectedCardIds.length === b.selectedCardIds.length &&
    a.selectedCardIds.every((id, i) => id === b.selectedCardIds[i])
  );
}

export interface WorkspaceAgentState {
  isOpen: boolean;
  workspaceId: string | null;
  context: WorkspaceAgentContext;
  /** Every voice available in this conversation. Always begins with plain GRIOT. */
  personas: WorkspaceAgentPersona[];
  /** Who answers the next message. Always an id present in {@link personas}. */
  activePersonaId: string;
  messages: WorkspaceAgentMessage[];
  /**
   * What has become of each tag the user pressed `+` on, keyed `messageId:tagId`. A tag
   * with no entry here has never been acted on — which is every tag, until a tap.
   */
  tagActions: Record<string, WorkspaceAgentTagAction>;
  isThinking: boolean;
  /** An actionable failure (no key, no gateway support, network error, malformed reply). */
  agentError: string | null;
  /**
   * The saved conversation this transcript belongs to, or null before the first message
   * has made it worth saving.
   */
  conversationId: string | null;
  /** Past conversations for this workspace, newest first. Loaded when history opens. */
  history: Conversation[];
  isHistoryOpen: boolean;
}

/** The effects the workflow needs from the app but must not own. */
export interface WorkspaceAgentHost {
  /** Conversation state changed; re-render. */
  onChange(): void;
  /** Injectable for tests; defaults to reading `apiKey`/`model` as empty/unset. */
  apiKey?(): string;
  model?(): string;
  /** The user's edited "workspace-agent" prompt body, if any — see `entities/agentPrompts`. */
  systemPrompt?(): string;
  /**
   * The chat personas the user has configured, already model-resolved. Plain GRIOT is
   * added by the workflow and must not appear here. Absent means "GRIOT only", which is
   * every conversation's behavior before personas existed.
   */
  personas?(): WorkspaceAgentPersona[];
  /**
   * Whether the provider's own web search may ride along. Defaults to on when the host
   * doesn't say — the gateway treats only an explicit `false` as an opt-out.
   *
   * This flag governs *asking*. It never governs *claiming*: the receipts shown beside a
   * reply come from citations the provider actually returned, so a turn made with search
   * enabled that consulted nothing shows nothing.
   */
  webSearchEnabled?(): boolean;
  /** All cards in the active workspace, for bounded context + card-id validation. */
  allCards?(): Card[];
  /**
   * The live scope — current selection, current group, currently open card — read fresh
   * every time the state is projected or a message is sent. Optional: without it the
   * workflow falls back to whatever `openConversation` was given, which is a snapshot.
   */
  currentContext?(): WorkspaceAgentContext;
}

export interface WorkspaceAgentWorkflowDeps {
  host: WorkspaceAgentHost;
  /** Optional: the sheet is fully usable (transcript-only) without one. */
  agentGateway?: AgentGateway;
  /** Injectable for tests; defaults to `Date.now`. */
  now?: () => number;
  /** Injectable id generator for tests; defaults to a simple random string. */
  generateId?: () => string;
  /**
   * Dispatches one tool intent to the real interactor(s) and resolves with a truthful,
   * factual completion message, or rejects with an Error whose message is a truthful,
   * factual failure message. Never called except from {@link WorkspaceAgentWorkflow.addTag}
   * — never while a reply is being parsed or streamed. Optional so the sheet remains
   * usable (transcript + inert chips) without a controller wired in.
   */
  dispatchTool?: (tool: AgentToolIntent, context: WorkspaceAgentContext) => Promise<string>;
  /**
   * Where transcripts are kept. Optional: without one the sheet behaves exactly as it did
   * when conversations were session-only, rather than failing.
   */
  conversationRepo?: ConversationRepository;
}

const EMPTY_CONTEXT: WorkspaceAgentContext = {
  selectedCardIds: [],
  currentGroupId: null,
};

const EMPTY_STATE: WorkspaceAgentState = {
  isOpen: false,
  workspaceId: null,
  context: EMPTY_CONTEXT,
  personas: [],
  activePersonaId: DEFAULT_PERSONA_ID,
  messages: [],
  tagActions: {},
  isThinking: false,
  agentError: null,
  conversationId: null,
  history: [],
  isHistoryOpen: false,
};

/** Identity comparison for the persona list, so a re-read doesn't churn re-renders. */
function samePersonas(a: WorkspaceAgentPersona[], b: WorkspaceAgentPersona[]): boolean {
  return (
    a.length === b.length &&
    a.every((persona, i) => {
      const other = b[i];
      return (
        persona.id === other.id &&
        persona.name === other.name &&
        persona.model === other.model &&
        persona.systemPrompt === other.systemPrompt
      );
    })
  );
}

export class WorkspaceAgentWorkflow {
  private current: WorkspaceAgentState = { ...EMPTY_STATE };

  constructor(private readonly deps: WorkspaceAgentWorkflowDeps) {}

  /**
   * The current session state, with `context` refreshed from the host so the chips the
   * user sees and the cards the model gets are the same thing. The refresh mutates the
   * cached state object in place (rather than allocating per read) so repeated reads keep
   * a stable identity for re-render comparisons.
   */
  get state(): WorkspaceAgentState {
    if (this.current.isOpen) {
      const live = this.deps.host.currentContext?.();
      if (live && !sameContext(live, this.current.context)) {
        this.current = {
          ...this.current,
          context: { ...live, selectedCardIds: [...live.selectedCardIds] },
        };
      }
      // Personas are re-read for the same reason context is: the user can add, delete, or
      // re-model a persona in Settings while the sheet is open, and the selector must
      // offer what exists now. A deleted active persona falls back to GRIOT rather than
      // leaving the conversation pointed at a voice that is gone.
      const personas = this.resolvePersonas();
      if (!samePersonas(personas, this.current.personas)) {
        const stillThere = personas.some(p => p.id === this.current.activePersonaId);
        this.current = {
          ...this.current,
          personas,
          activePersonaId: stillThere ? this.current.activePersonaId : DEFAULT_PERSONA_ID,
        };
      }
    }
    return this.current;
  }

  /**
   * Every voice available, GRIOT always first.
   *
   * GRIOT is synthesized here rather than supplied by the host so it can never be removed,
   * renamed out of existence, or shadowed by a configured persona claiming its id — the
   * user must always be able to get back to the plain assistant.
   */
  private resolvePersonas(): WorkspaceAgentPersona[] {
    const griot: WorkspaceAgentPersona = {
      id: DEFAULT_PERSONA_ID,
      name: "GRIOT",
      model: this.deps.host.model?.() ?? "",
    };
    const configured = (this.deps.host.personas?.() ?? []).filter(
      persona => persona.id !== DEFAULT_PERSONA_ID
    );
    return [griot, ...configured];
  }

  /**
   * Who answers this message, in order.
   *
   * The three cases are deliberately not blended: an explicit panel, everyone, or the one
   * active voice. In particular a panel whose members have all been deleted resolves to
   * nobody — the caller reports that rather than quietly widening the question.
   */
  private resolveSpeakers(options: {
    askAll?: boolean;
    speakerIds?: string[];
  }): WorkspaceAgentPersona[] {
    if (options.speakerIds) {
      const byId = new Map(this.resolvePersonas().map(persona => [persona.id, persona]));
      return options.speakerIds
        .map(id => byId.get(id))
        .filter((persona): persona is WorkspaceAgentPersona => persona !== undefined);
    }
    return options.askAll ? this.resolvePersonas() : [this.activePersona()];
  }

  /** The persona that answers next. Falls back to GRIOT if the active id has gone away. */
  private activePersona(): WorkspaceAgentPersona {
    const personas = this.resolvePersonas();
    return personas.find(p => p.id === this.current.activePersonaId) ?? personas[0];
  }

  /** Switches who answers next. An unknown id is ignored rather than silently reassigned. */
  setActivePersona(personaId: string): void {
    if (!this.resolvePersonas().some(p => p.id === personaId)) return;
    this.patch({ activePersonaId: personaId });
  }

  private patch(changes: Partial<WorkspaceAgentState>): void {
    this.current = { ...this.current, ...changes };
    this.deps.host.onChange();
  }

  /** Opens (or re-scopes) the conversation sheet for a workspace. Never touches a gateway. */
  openConversation(workspaceId: string, context: WorkspaceAgentContext): void {
    this.patch({
      isOpen: true,
      workspaceId,
      context: { ...context, selectedCardIds: [...context.selectedCardIds] },
    });
  }

  /**
   * Closes the sheet, saving the transcript on the way out.
   *
   * Not awaited by callers, and deliberately so: closing must feel instant. The write is
   * already queued behind the store's mutex, so it cannot interleave with the next one.
   */
  closeConversation(): void {
    void this.persist();
    this.patch({ ...EMPTY_STATE });
  }

  /**
   * Appends a user message, then asks the model for a turn if one is configured.
   *
   * The user's message always appears immediately, `pending`. What happens next is
   * strictly one of: no key/no gateway support → an actionable error and the message
   * stays pending; malformed/unparseable reply → an actionable error, no proposals
   * stored; a valid reply → an assistant message plus inspectable (never executed)
   * proposals.
   */
  async sendMessage(
    text: string,
    options: {
      /**
       * Put the question to every persona instead of just the active one. They answer in
       * order, and because each turn's briefing includes the transcript so far, later
       * voices can see — and argue with — what the earlier ones said.
       */
      askAll?: boolean;
      /**
       * Put the question to exactly these personas, in this order — a saved roundtable.
       *
       * Takes precedence over `askAll`, because it is the more specific request: a user
       * who chose a panel chose it *instead of* everyone. Ids that no longer resolve are
       * dropped, and a list that resolves to nobody asks nobody rather than falling back
       * to the whole roster, which would put the question to voices they did not pick.
       */
      speakerIds?: string[];
    } = {}
  ): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || !this.current.isOpen) return;

    const message: WorkspaceAgentMessage = {
      id: this.generateId(),
      speaker: "user",
      text: trimmed,
      createdAt: this.now(),
      pending: true,
    };

    this.patch({ messages: [...this.current.messages, message], agentError: null });
    // Saved before the reply is requested, so a turn that fails still keeps the question.
    await this.persist();

    const speakers = this.resolveSpeakers(options);
    if (speakers.length === 0) {
      this.patch({
        agentError: "Nobody is left on that roundtable — its voices have been deleted.",
      });
      return;
    }
    for (const persona of speakers) {
      // The whole panel is handed to each turn, not just the speaker: a voice has to be
      // told the other names in the room are characters, or it reads their lines as its
      // own or as the learner's. See `briefing`.
      await this.requestTurn(persona, speakers);
      // A hard failure (no key, no gateway, network down) will fail identically for every
      // remaining persona. Stopping reports it once instead of N times.
      if (this.current.agentError) break;
    }
  }

  /**
   * The user pressed `+` on a tag: dispatch its intent to the real interactor(s).
   *
   * This is the **only** path from a reply to a change in the workspace. A tag is inert
   * until this runs — parsing one, streaming one, rendering one, none of that creates
   * anything. A tag whose intent is `null` (an unresolvable card reference, a link that
   * isn't a URL) has nothing to dispatch and is refused here as well as in the UI.
   *
   * The action goes "pending" immediately so the chip can disable, then settles on "done"
   * or "failed" with a truthful message either way. Pressing `+` twice does nothing the
   * second time.
   */
  async addTag(messageId: string, tagId: string): Promise<void> {
    const key = tagActionKey(messageId, tagId);
    if (this.current.tagActions[key]) return;

    const tag = this.findTag(messageId, tagId);
    if (!tag?.intent) return;

    const setAction = (action: WorkspaceAgentTagAction): void => {
      this.patch({ tagActions: { ...this.current.tagActions, [key]: action } });
    };

    setAction({ status: "pending" });

    const dispatch = this.deps.dispatchTool;
    if (!dispatch) {
      setAction({ status: "failed", resultMessage: "Nothing is wired up to add this yet." });
      return;
    }

    try {
      const resultMessage = await dispatch(tag.intent, this.state.context);
      setAction({ status: "done", resultMessage });
    } catch (error: any) {
      setAction({
        status: "failed",
        resultMessage: error?.message ?? "That didn't complete. Nothing was changed.",
      });
    }
    // Either outcome is worth remembering: it is what stops a reopened conversation from
    // offering a fresh `+` on a card that already exists.
    await this.persist();
  }

  // --- Persistence & history ---

  /**
   * Writes the current transcript to the conversation store.
   *
   * Called after anything real changed. Silent on failure by design: a storage error must
   * not tear down a conversation the user is in the middle of, and the transcript on
   * screen is still correct — it is only the copy on disk that is behind.
   */
  private async persist(): Promise<void> {
    const repo = this.deps.conversationRepo;
    const workspaceId = this.current.workspaceId;
    if (!repo || !workspaceId) return;

    const messages = this.toConversationMessages(this.current.messages);
    const draft = createConversation({
      workspaceId,
      id: this.current.conversationId ?? undefined,
      messages,
      tagActions: this.settledTagActions(),
      now: this.now(),
    });
    // An opened-and-abandoned sheet is not a conversation; a history list full of empty
    // rows is worse than no history.
    if (!isWorthSaving(draft)) return;

    try {
      await repo.saveConversation(draft);
      if (!this.current.conversationId) this.patch({ conversationId: draft.id });
    } catch {
      // See the note above: the on-screen transcript remains the source of truth.
    }
  }

  /** Runtime messages narrowed to what is worth storing — the raw text, not the rendering. */
  private toConversationMessages(messages: WorkspaceAgentMessage[]): ConversationMessage[] {
    return messages
      // A reply still streaming is not a turn yet; persisting it would save half a sentence.
      .filter(message => !message.streaming)
      .map(message => ({
        id: message.id,
        speaker: message.speaker,
        text: message.speaker === "assistant" ? (message.rawText ?? message.text) : message.text,
        createdAt: message.createdAt,
        ...(message.personaId ? { personaId: message.personaId } : {}),
        ...(message.personaName ? { personaName: message.personaName } : {}),
        ...(message.model ? { model: message.model } : {}),
        ...(message.reasoning ? { reasoning: message.reasoning } : {}),
      }));
  }

  /**
   * Tag outcomes worth persisting: the settled ones.
   *
   * `pending` is dropped — it means a dispatch was in flight when we saved, and neither
   * "it worked" nor "it failed" is something we know. See `entities/conversation`.
   */
  private settledTagActions(): Record<string, ConversationTagAction> {
    const settled: Record<string, ConversationTagAction> = {};
    for (const [key, action] of Object.entries(this.current.tagActions)) {
      if (action.status === "pending") continue;
      settled[key] = {
        status: action.status,
        ...(action.resultMessage ? { resultMessage: action.resultMessage } : {}),
      };
    }
    return settled;
  }

  /** Loads this workspace's saved conversations and opens the history list. */
  async openHistory(): Promise<void> {
    const repo = this.deps.conversationRepo;
    const workspaceId = this.current.workspaceId;
    if (!repo || !workspaceId) {
      this.patch({ isHistoryOpen: true, history: [] });
      return;
    }
    try {
      const saved = await repo.getConversations(workspaceId);
      this.patch({ isHistoryOpen: true, history: sortByRecency(saved) });
    } catch {
      // An unreadable store yields an empty list rather than a broken sheet. The user can
      // still carry on with the conversation they are in.
      this.patch({ isHistoryOpen: true, history: [] });
    }
  }

  closeHistory(): void {
    this.patch({ isHistoryOpen: false });
  }

  /**
   * Replaces the transcript with a saved one.
   *
   * Assistant turns are re-parsed from their stored raw text against the cards in scope
   * *now*, so a chip whose card has since been deleted is refused the same way it would be
   * in a live turn — a restored conversation never offers to act on something gone.
   */
  async loadConversation(conversationId: string): Promise<void> {
    const repo = this.deps.conversationRepo;
    if (!repo) return;

    let saved: Conversation | undefined;
    try {
      saved = await repo.getConversation(conversationId);
    } catch {
      saved = undefined;
    }
    if (!saved) {
      this.patch({ isHistoryOpen: false, agentError: "That conversation could not be opened." });
      return;
    }

    // Persist whatever is on screen before replacing it, so switching conversations never
    // silently discards the one being left.
    await this.persist();

    const allCards = this.deps.host.allCards?.() ?? [];
    const tagCards = allCards.map(card => ({ id: card.id, title: card.title }));

    const messages: WorkspaceAgentMessage[] = saved.messages.map(message => {
      if (message.speaker === "user") {
        return {
          id: message.id,
          speaker: "user" as const,
          text: message.text,
          createdAt: message.createdAt,
        };
      }
      const parsed = parseAgentTags(message.text, { cards: tagCards });
      return {
        id: message.id,
        speaker: "assistant" as const,
        text: parsed.text,
        rawText: message.text,
        segments: parsed.segments,
        createdAt: message.createdAt,
        ...(message.personaId ? { personaId: message.personaId } : {}),
        ...(message.personaName ? { personaName: message.personaName } : {}),
        ...(message.model ? { model: message.model } : {}),
        ...(message.reasoning ? { reasoning: message.reasoning } : {}),
      };
    });

    this.patch({
      conversationId: saved.id,
      messages,
      tagActions: { ...saved.tagActions },
      isHistoryOpen: false,
      agentError: null,
      isThinking: false,
    });
  }

  /** Saves the current transcript and starts an empty one in the same workspace. */
  async startNewConversation(): Promise<void> {
    await this.persist();
    this.patch({
      conversationId: null,
      messages: [],
      tagActions: {},
      agentError: null,
      isThinking: false,
      isHistoryOpen: false,
    });
  }

  /** Forgets a saved conversation. Clears the open transcript too if it was that one. */
  async deleteConversation(conversationId: string): Promise<void> {
    const repo = this.deps.conversationRepo;
    if (!repo) return;
    try {
      await repo.deleteConversation(conversationId);
    } catch {
      return;
    }
    const clearing = this.current.conversationId === conversationId;
    this.patch({
      history: this.current.history.filter(conversation => conversation.id !== conversationId),
      ...(clearing ? { conversationId: null, messages: [], tagActions: {} } : {}),
    });
  }

  /** The tag a `+` belongs to, or undefined — never a tag from a different message. */
  private findTag(messageId: string, tagId: string): ParsedAgentTag | undefined {
    const message = this.current.messages.find(m => m.id === messageId);
    for (const segment of message?.segments ?? []) {
      if (segment.kind === "tag" && segment.tag.id === tagId) return segment.tag;
    }
    return undefined;
  }

  private async requestTurn(
    persona: WorkspaceAgentPersona,
    panel: WorkspaceAgentPersona[] = [persona]
  ): Promise<void> {
    const apiKey = (this.deps.host.apiKey?.() ?? "").trim();
    const gateway = this.deps.agentGateway;

    if (!apiKey) {
      this.patch({
        agentError:
          "No API key is set, so I can't ask a model. Add a key in Settings to enable this.",
      });
      return;
    }
    if (!gateway?.designWorkspaceAgentTurn) {
      this.patch({ agentError: "This build has no model connection for the workspace agent." });
      return;
    }

    this.patch({ isThinking: true, agentError: null });

    const replyId = this.generateId();

    try {
      const allCards = this.deps.host.allCards?.() ?? [];
      // Read live, at send time: the selection or open card may have changed since the
      // sheet was opened, and the model must see what the user is looking at now.
      const context = this.state.context;
      const focusIds = contextCardIds(context);
      const byId = new Map(allCards.map(c => [c.id, c]));
      // Ordered by priority (open card, then selection) so `resolveScopedContext`'s
      // selection-first ordering keeps them ahead of generic workspace siblings when the
      // budget truncates.
      const focusCards = focusIds
        .map(id => byId.get(id))
        .filter((c): c is Card => Boolean(c));

      const scoped = resolveScopedContext({
        scope: "workspace",
        allCards,
        selectedCards: focusCards,
        parentId: context.currentGroupId,
      });

      const briefing = this.briefing(scoped.cards, new Set(focusIds), persona, panel);
      // Captured from the very values the request is built from, so the disclosure the
      // user audits is the request, not a later reconstruction of it.
      const sentContext: WorkspaceAgentSentContext = {
        groupId: context.currentGroupId,
        cardIds: scoped.cards.map(card => card.id),
        focusCardIds: [...focusIds],
        briefing,
      };

      // The cards exactly as the briefing numbered them. This is what turns "1" or a
      // title in a tag back into a real card id — the model never sees or writes an id.
      const tagCards = scoped.cards.map(card => ({ id: card.id, title: card.title }));
      const contextIds = focusIds.filter(id => byId.has(id));

      let text = "";
      let reasoning = "";

      /**
       * Writes the in-flight reply into state so the sheet renders it as it is generated.
       * Re-parsing on every token is cheap — the parser is pure — and `streaming: true`
       * keeps a half-written tag from ever appearing as a broken chip.
       */
      const render = (streaming: boolean, extra: Partial<WorkspaceAgentMessage> = {}): void => {
        const parsed = parseAgentTags(text, {
          cards: tagCards,
          contextCardIds: contextIds,
          streaming,
        });
        const trimmedReasoning = reasoning.trim();
        const reply: WorkspaceAgentMessage = {
          id: replyId,
          speaker: "assistant",
          text: parsed.text,
          createdAt: this.now(),
          // Stamped from the persona this turn was actually sent as, not from whoever is
          // active by the time it finishes — an "ask all" run has a different persona
          // active than the one currently streaming.
          personaId: persona.id,
          personaName: persona.name,
          ...(persona.model ? { model: persona.model } : {}),
          sentContext,
          segments: parsed.segments,
          // The source the segments came from — what persistence stores.
          rawText: text,
          ...(streaming ? { streaming: true } : {}),
          // Only a non-empty string counts. A provider that returns nothing leaves this
          // undefined, and the sheet then renders no reasoning UI whatsoever.
          ...(trimmedReasoning ? { reasoning: trimmedReasoning } : {}),
          ...extra,
        };
        const messages = this.current.messages
          .map(m => (m.speaker === "user" ? { ...m, pending: false } : m))
          .filter(m => m.id !== replyId);
        this.patch({ messages: [...messages, reply] });
      };

      const result = await gateway.designWorkspaceAgentTurn({
        briefing,
        apiKey,
        // The persona's own model and voice. Its body replaces the user's workspace-agent
        // body downstream; the parent rules and tag contract are appended either way.
        model: persona.model || (this.deps.host.model?.() ?? ""),
        systemPrompt: persona.systemPrompt ?? this.deps.host.systemPrompt?.(),
        webSearchEnabled: this.deps.host.webSearchEnabled?.(),
        // A gateway that cannot stream never calls this, and the reply simply appears
        // whole. Nothing here fakes a typing effect when the provider doesn't stream.
        onDelta: delta => {
          if (delta.text) text += delta.text;
          if (delta.reasoning) reasoning += delta.reasoning;
          render(true);
        },
      });

      // The completed turn is authoritative over whatever the deltas accumulated: a
      // gateway that didn't stream returns everything here, and one that did returns the
      // same text again.
      text = result.text ?? text;
      reasoning = result.reasoning ?? reasoning;

      // Only real citations count as evidence the web was consulted. `webSearchEnabled`
      // being on proves nothing: the provider's search can return nothing, and the model
      // can answer without invoking it at all.
      const citations = result.webCitations ?? [];

      render(false, ...([citations.length > 0 ? { webCitations: citations } : {}] as const));
      this.patch({ isThinking: false, agentError: null });
      await this.persist();
    } catch (error: any) {
      // A stream that died mid-way is not an answer. The partial text is dropped rather
      // than presented as a reply, and nothing was created either way.
      this.patch({
        isThinking: false,
        messages: this.current.messages
          .filter(m => m.id !== replyId)
          .map(m => (m.speaker === "user" ? { ...m, pending: false } : m)),
        agentError: `Couldn't reach the model: ${error?.message ?? "unknown error"}.`,
      });
    }
  }

  /**
   * The bounded briefing: the scoped cards, **numbered**, plus the transcript so far.
   *
   * Cards are listed as `1.`, `2.`, … and their real ids are deliberately withheld.
   * Copying an opaque id is the single hardest thing we could ask a small model to do,
   * and it is unnecessary: a tag refers to a card by its number or its title, and
   * `parseAgentTags` resolves that back to the real id on this side of the wire.
   */
  private briefing(
    cards: Card[],
    focusIds: Set<string> = new Set(),
    speaking?: WorkspaceAgentPersona,
    panel: WorkspaceAgentPersona[] = []
  ): string {
    const lines: string[] = [];

    const staging = this.stageDirection(speaking, panel);
    if (staging) lines.push(staging, "");

    if (cards.length > 0) {
      lines.push("Cards in scope, numbered:");
      cards.forEach((card, index) => {
        // "focus" marks the card(s) the user actually has open or selected, so "explain
        // this" resolves to the right one rather than to a same-group sibling.
        const focus = focusIds.has(card.id) ? " [focus]" : "";
        lines.push(`${index + 1}.${focus} ${card.title}: ${card.body}`.slice(0, 600));
      });
    } else {
      lines.push("No cards are currently in scope.");
    }

    lines.push("\nConversation so far:");
    for (const message of this.current.messages) {
      // Assistant turns are labelled by persona so a multi-voice transcript reads as a
      // discussion rather than as one assistant contradicting itself — and so a persona
      // can address what another one actually said.
      const speaker =
        message.speaker === "assistant" && message.personaName
          ? message.personaName
          : message.speaker;
      lines.push(`${speaker}: ${message.text}`);
    }

    return lines.join("\n");
  }

  /**
   * Who the speaker is, and who every other name in the transcript is.
   *
   * ## The bug this fixes
   * The transcript labels each turn by persona name, but nothing ever told the model what
   * those labels *were*. A voice would read "Skeptic: ..." above its own turn and take it
   * for something it had said itself, or for the learner talking — so it would answer the
   * learner's question twice, agree with itself, or reply to a character as though the
   * character were the person it is helping. The labels were only ever legible to us.
   *
   * ## Why it lives in the briefing rather than the system prompt
   * It describes *this transcript* — these names, this room — and it changes from turn to
   * turn as the panel does. The system prompt is the persona's own body, which the user
   * owns and may replace entirely; staging that a user could delete would make the whole
   * feature intermittent. Put here, it travels with the thing it is about and cannot be
   * edited away.
   *
   * Returns an empty string for a plain one-voice conversation, which needs no staging and
   * should not pay tokens for it.
   */
  private stageDirection(
    speaking: WorkspaceAgentPersona | undefined,
    panel: WorkspaceAgentPersona[]
  ): string {
    if (!speaking) return "";

    // Everyone who has actually spoken, plus everyone about to: a panel assembled midway
    // through a conversation still has to account for the voices already in the
    // transcript, and a voice asked alone after a panel run still sees their lines.
    const others = new Set<string>();
    for (const persona of panel) {
      if (persona.id !== speaking.id) others.add(persona.name);
    }
    for (const message of this.current.messages) {
      if (message.speaker !== "assistant") continue;
      if (!message.personaName || message.personaName === speaking.name) continue;
      others.add(message.personaName);
    }

    if (others.size === 0) {
      // Still worth naming the speaker: without it a persona reads its own earlier turns,
      // labelled with a name nobody told it was its own, as somebody else's.
      return `You are "${speaking.name}". Lines labelled "${speaking.name}" below are your own earlier turns. Lines labelled "user" are the learner you are helping.`;
    }

    const names = [...others].map(name => `"${name}"`).join(", ");
    return [
      `You are "${speaking.name}", one of several characters answering the same learner in one conversation.`,
      `Lines labelled "user" are the learner. Lines labelled "${speaking.name}" are your own earlier turns. Lines labelled ${names} are the OTHER characters — not you, and not the learner.`,
      `Answer the learner. When another character has already spoken, engage with what they actually said: name them, say where you agree, and say plainly where you do not. Do not repeat a point one of them already made as though it were new.`,
      `Never write another character's lines, never answer on their behalf, and never treat something a character said as though the learner had said it.`,
    ].join("\n");
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private generateId(): string {
    return this.deps.generateId
      ? this.deps.generateId()
      : Math.random().toString(36).substring(2, 10);
  }
}

/** The key one tag's action is stored under. Message-scoped, so two turns never collide. */
export function tagActionKey(messageId: string, tagId: string): string {
  return `${messageId}:${tagId}`;
}
