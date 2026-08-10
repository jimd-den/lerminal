import { Card } from "../../entities/card";
import { AgentToolIntent } from "../../entities/workspaceAgent";
import { AgentTagAction, AgentVoice, agentTagActionKey } from "../../entities/agentMessage";
import { AgentMessageSegment, ParsedAgentTag, parseAgentTags } from "../../entities/agentTags";
import {
  Conversation,
  ConversationMessage,
  createConversation,
  isWorthSaving,
  sortByRecency,
  threadForRoundtable,
  thinkTankThreads,
} from "../../entities/conversation";
import { AgentGateway } from "../ports/gateways/AgentGateway";
import { ConversationRepository } from "../ports/repositories/ConversationRepository";
import { resolveScopedContext } from "../agent/AgentScope";

/**
 * # Think Tank Workflow — a separate history for a separate kind of conversation
 *
 * ## Business Value & Purpose
 * The Bridge board first shared its transcript with the ambient "Ask GRIOT" conversation:
 * one slot, whichever table spoke into it last. That made "switch tables" impossible
 * without losing whichever one you switched away from, and made the board's own history
 * indistinguishable from — and at risk of being wiped by — the modal's. This workflow is
 * the fix: **every think tank is its own thread, addressed by the roundtable that produced
 * it, loaded and saved independently of every other one.**
 *
 * ## Why this is a separate workflow, not a mode of `WorkspaceAgentWorkflow`
 * The two are close cousins — same tag grammar, same gateway call, same dispatch — but
 * they answer structurally different questions. The ambient conversation is *one* live
 * transcript, scoped to whatever the user has selected or has open right now, with a
 * *changeable* audience (one persona, all of them, a named panel). A think tank thread has
 * a **fixed panel**, decided once at convening, and is *one of several* live at a time —
 * the whole point is being able to hold more than one open. Bolting "several, addressed by
 * id" onto a class built around "exactly one, addressed implicitly" would have meant a
 * second code path threaded through every method of the first. A dedicated workflow, over
 * the same {@link AgentGateway} and {@link ConversationRepository} ports, keeps each
 * shape honest about what it actually is.
 *
 * ## What is shared, and how
 * Nothing is duplicated that does not have to be: the message and tag-action shapes come
 * from `entities/agentMessage` (also what the ambient workflow builds on), the persisted
 * form is the *same* {@link Conversation} record — tagged with `roundtableId` — read and
 * written through the *same* repository, and a turn is dispatched through the *same*
 * `dispatchTool` callback the ambient conversation's tags use. Two workflows, one store,
 * one dispatcher, one truth about what a `+` actually does.
 *
 * ## The invariant, unchanged
 * A watch — sending, streaming, parsing tags — creates nothing. Only {@link addTag}, the
 * captain's explicit tap, ever reaches `dispatchTool`.
 */

export type ThinkTankMessage = import("../../entities/agentMessage").AgentTurnMessage;

/** One live, addressable conversation — always with a fixed panel, decided at convening. */
export interface ThinkTankThread {
  roundtableId: string;
  roundtableName: string;
  /** The panel this thread was convened with. A member later deleted still answers here. */
  members: AgentVoice[];
  messages: ThinkTankMessage[];
  /** Settled tag outcomes, keyed `messageId:tagId`. */
  tagActions: Record<string, AgentTagAction>;
  isThinking: boolean;
  /** An actionable failure (no key, no gateway support, network error). */
  error: string | null;
  /** The persisted record's id, once this thread has been saved at least once. */
  conversationId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** One row in the think-tank history list — everything shown without loading the thread. */
export interface ThinkTankHistoryEntry {
  /** The persisted record's own id — what {@link ThinkTankWorkflow.deleteThread} deletes. */
  conversationId: string;
  roundtableId: string;
  roundtableName: string;
  title: string;
  messageCount: number;
  updatedAt: number;
}

export interface ThinkTankState {
  workspaceId: string | null;
  /** Which thread the board shows right now, or null when none is on screen. */
  activeRoundtableId: string | null;
  /** Live threads, keyed by roundtable id — the active one, plus any switched to this session. */
  threads: Record<string, ThinkTankThread>;
  /** Every saved thread for this workspace. Loaded once `open()` has run. */
  history: ThinkTankHistoryEntry[];
  isHistoryOpen: boolean;
  /** False until the repository has been read once, so the board can tell empty from unloaded. */
  loaded: boolean;
}

/**
 * A think tank with no workspace loaded and nothing convened. Exported as the honest zero
 * value for anything that has to describe one it does not have — a projection test, a
 * controller built without a repository — the same role `EMPTY_BRIDGE_STATE` plays for
 * the Bridge's own workflow.
 */
export const EMPTY_THINK_TANK_STATE: ThinkTankState = {
  workspaceId: null,
  activeRoundtableId: null,
  threads: {},
  history: [],
  isHistoryOpen: false,
  loaded: false,
};
const EMPTY_STATE = EMPTY_THINK_TANK_STATE;

/** What the workflow needs from the app but must not own. */
export interface ThinkTankHost {
  onChange(): void;
  apiKey?(): string;
  model?(): string;
  /** The user's edited "workspace-agent" prompt body — the same one the ambient chat uses. */
  systemPrompt?(): string;
  webSearchEnabled?(): boolean;
  allCards?(): Card[];
}

export interface ThinkTankWorkflowDeps {
  host: ThinkTankHost;
  agentGateway?: AgentGateway;
  conversationRepo?: ConversationRepository;
  /**
   * Dispatches one confirmed intent to the real interactors — the same callback
   * `WorkspaceAgentWorkflow` is given, so a card a think tank proposes and a card the
   * ambient conversation proposes go through the identical dispatcher.
   */
  dispatchTool?: (tool: AgentToolIntent) => Promise<string>;
  now?: () => number;
  generateId?: () => string;
}

export class ThinkTankWorkflow {
  private current: ThinkTankState = { ...EMPTY_STATE };

  constructor(private readonly deps: ThinkTankWorkflowDeps) {}

  get state(): ThinkTankState {
    return this.current;
  }

  private patch(changes: Partial<ThinkTankState>): void {
    this.current = { ...this.current, ...changes };
    this.deps.host.onChange();
  }

  private patchThread(roundtableId: string, changes: Partial<ThinkTankThread>): void {
    const thread = this.current.threads[roundtableId];
    if (!thread) return;
    this.patch({
      threads: {
        ...this.current.threads,
        [roundtableId]: { ...thread, ...changes, updatedAt: this.now() },
      },
    });
  }

  // --- Coming to the workspace ---

  /**
   * Loads the history list for a workspace. Threads themselves are loaded on demand — see
   * {@link setActive} — so opening a workspace with forty past think tanks costs one
   * lightweight read, not forty full transcripts.
   */
  async open(workspaceId: string): Promise<void> {
    if (this.current.workspaceId !== workspaceId) {
      this.patch({ ...EMPTY_STATE, workspaceId });
    }

    const repo = this.deps.conversationRepo;
    if (!repo) {
      this.patch({ loaded: true });
      return;
    }
    try {
      const saved = await repo.getConversations(workspaceId);
      this.patch({ history: toHistory(thinkTankThreads(saved)), loaded: true });
    } catch {
      // An unreadable store yields an empty history rather than a broken board.
      this.patch({ loaded: true });
    }
  }

  // --- Convening and posting ---

  /**
   * Starts a new thread for a freshly designed roundtable and puts the opening topic to
   * it. The panel is fixed here, once, from the members the caller resolved — see the
   * class doc on why a thread's audience never changes after this.
   */
  async convene(
    roundtableId: string,
    roundtableName: string,
    members: AgentVoice[],
    topic: string
  ): Promise<void> {
    if (members.length === 0) return;
    const now = this.now();
    const thread: ThinkTankThread = {
      roundtableId,
      roundtableName,
      members,
      messages: [],
      tagActions: {},
      isThinking: false,
      error: null,
      conversationId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.patch({
      threads: { ...this.current.threads, [roundtableId]: thread },
      activeRoundtableId: roundtableId,
    });
    await this.post(roundtableId, topic);
  }

  /**
   * Posts to an already-live thread: appends the message, then asks every member of the
   * thread's fixed panel in turn, each seeing the transcript — including what the earlier
   * voices in this same turn just said.
   */
  async post(roundtableId: string, text: string): Promise<void> {
    const trimmed = text.trim();
    const thread = this.current.threads[roundtableId];
    if (!trimmed || !thread) return;

    const message: ThinkTankMessage = {
      id: this.generateId(),
      speaker: "user",
      text: trimmed,
      createdAt: this.now(),
      pending: true,
    };
    this.patchThread(roundtableId, { messages: [...thread.messages, message] });
    await this.persist(roundtableId);

    for (const voice of thread.members) {
      await this.requestTurn(roundtableId, voice, thread.members);
      // A hard failure (no key, no gateway, network down) fails identically for every
      // remaining voice. Stopping reports it once instead of N times.
      if (this.current.threads[roundtableId]?.error) break;
    }
  }

  /**
   * Re-asks a reply's own voice the same question that produced it — an independent
   * second attempt, posted fresh rather than editing the first.
   */
  async retryReply(roundtableId: string, messageId: string): Promise<void> {
    const thread = this.current.threads[roundtableId];
    const message = thread?.messages.find(m => m.id === messageId);
    if (!thread || !message || message.speaker !== "assistant" || !message.personaId) return;
    const priorQuestion = nearestPrecedingUserText(thread.messages, messageId);
    if (!priorQuestion) return;
    await this.postToOne(roundtableId, message.personaId, priorQuestion);
  }

  /** Asks a reply's own voice to look at what it just said again. */
  async rethinkReply(roundtableId: string, messageId: string): Promise<void> {
    const thread = this.current.threads[roundtableId];
    const message = thread?.messages.find(m => m.id === messageId);
    if (!thread || !message || message.speaker !== "assistant" || !message.personaId) return;
    const said = message.rawText ?? message.text;
    await this.postToOne(
      roundtableId,
      message.personaId,
      `Look again at what you just said: "${said}". Is it actually right? Reconsider it and say plainly if you'd revise anything, and what.`
    );
  }

  /** Posts a message but asks only one member of the panel, not the whole room. */
  private async postToOne(roundtableId: string, voiceId: string, text: string): Promise<void> {
    const thread = this.current.threads[roundtableId];
    const voice = thread?.members.find(m => m.id === voiceId);
    if (!thread || !voice) return;

    const message: ThinkTankMessage = {
      id: this.generateId(),
      speaker: "user",
      text,
      createdAt: this.now(),
      pending: true,
    };
    this.patchThread(roundtableId, { messages: [...thread.messages, message] });
    await this.persist(roundtableId);
    await this.requestTurn(roundtableId, voice, thread.members);
  }

  /**
   * The user pressed `+` on a tag: dispatch its intent to the real interactor(s). The only
   * path from a thread to a change in the workspace — see the class doc's invariant.
   */
  async addTag(roundtableId: string, messageId: string, tagId: string): Promise<void> {
    const thread = this.current.threads[roundtableId];
    if (!thread) return;
    const key = agentTagActionKey(messageId, tagId);
    if (thread.tagActions[key]) return;

    const tag = findTag(thread.messages, messageId, tagId);
    if (!tag?.intent) return;

    const setAction = (action: AgentTagAction): void => {
      this.patchThread(roundtableId, {
        tagActions: { ...this.current.threads[roundtableId]!.tagActions, [key]: action },
      });
    };

    setAction({ status: "pending" });

    const dispatch = this.deps.dispatchTool;
    if (!dispatch) {
      setAction({ status: "failed", resultMessage: "Nothing is wired up to add this yet." });
      return;
    }
    try {
      const resultMessage = await dispatch(tag.intent);
      setAction({ status: "done", resultMessage });
    } catch (error: any) {
      setAction({
        status: "failed",
        resultMessage: error?.message ?? "That didn't complete. Nothing was changed.",
      });
    }
    await this.persist(roundtableId);
  }

  // --- Switching which thread is shown ---

  /**
   * Makes a thread the board's active one, loading it from the repository first if it is
   * not already live in memory — the history list only ever holds the lightweight entry,
   * never the full transcript, until the captain actually asks for it.
   */
  async setActive(roundtableId: string): Promise<void> {
    if (this.current.threads[roundtableId]) {
      this.patch({ activeRoundtableId: roundtableId });
      return;
    }

    const repo = this.deps.conversationRepo;
    const workspaceId = this.current.workspaceId;
    if (!repo || !workspaceId) return;

    let saved: Conversation[] = [];
    try {
      saved = await repo.getConversations(workspaceId);
    } catch {
      return;
    }
    const record = threadForRoundtable(saved, roundtableId);
    if (!record) return;

    const allCards = this.deps.host.allCards?.() ?? [];
    const tagCards = allCards.map(card => ({ id: card.id, title: card.title }));
    const messages = record.messages.map(message => toThreadMessage(message, tagCards));

    // The panel that answers here going forward is derived from who actually spoke in the
    // saved transcript — a deleted or re-modelled profile still shows what it once said,
    // and a thread reopened after the app restarted has *something* to ask even though the
    // caller supplied no fresh member list.
    const members = distinctSpeakers(record.messages);

    const thread: ThinkTankThread = {
      roundtableId,
      roundtableName: record.roundtableName ?? "The table",
      members,
      messages,
      tagActions: fromConversationTagActions(record.tagActions),
      isThinking: false,
      error: null,
      conversationId: record.id,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };

    this.patch({
      threads: { ...this.current.threads, [roundtableId]: thread },
      activeRoundtableId: roundtableId,
    });
  }

  /** Hides the board. The thread stays loaded and persisted; nothing here deletes it. */
  dismiss(): void {
    if (this.current.activeRoundtableId === null) return;
    this.patch({ activeRoundtableId: null });
  }

  openHistory(): void {
    this.patch({ isHistoryOpen: true });
  }

  closeHistory(): void {
    this.patch({ isHistoryOpen: false });
  }

  /** Forgets a saved thread entirely. Clears it from the board too if it was showing. */
  async deleteThread(roundtableId: string): Promise<void> {
    const repo = this.deps.conversationRepo;
    // The live thread's own id if it's loaded, otherwise the history row's — a thread the
    // captain never reopened this session is still deletable straight from the list.
    const conversationId =
      this.current.threads[roundtableId]?.conversationId ??
      this.current.history.find(entry => entry.roundtableId === roundtableId)?.conversationId;

    if (repo && conversationId) {
      try {
        await repo.deleteConversation(conversationId);
      } catch {
        return;
      }
    }

    const threads = { ...this.current.threads };
    delete threads[roundtableId];
    this.patch({
      threads,
      history: this.current.history.filter(entry => entry.roundtableId !== roundtableId),
      activeRoundtableId:
        this.current.activeRoundtableId === roundtableId ? null : this.current.activeRoundtableId,
    });
  }

  // --- The turn itself ---

  private async requestTurn(
    roundtableId: string,
    voice: AgentVoice,
    panel: AgentVoice[]
  ): Promise<void> {
    const apiKey = (this.deps.host.apiKey?.() ?? "").trim();
    const gateway = this.deps.agentGateway;

    if (!apiKey) {
      this.patchThread(roundtableId, {
        error: "No API key is set, so I can't ask a model. Add a key in Settings to enable this.",
      });
      return;
    }
    if (!gateway?.designWorkspaceAgentTurn) {
      this.patchThread(roundtableId, { error: "This build has no model connection for the think tank." });
      return;
    }

    this.patchThread(roundtableId, { isThinking: true, error: null });
    const replyId = this.generateId();

    try {
      const allCards = this.deps.host.allCards?.() ?? [];
      const scoped = resolveScopedContext({
        scope: "workspace",
        allCards,
        selectedCards: [],
        parentId: null,
      });
      const tagCards = scoped.cards.map(card => ({ id: card.id, title: card.title }));
      const briefing = this.briefing(roundtableId, scoped.cards, voice, panel);

      let text = "";
      let reasoning = "";

      const render = (streaming: boolean, extra: Partial<ThinkTankMessage> = {}): void => {
        const thread = this.current.threads[roundtableId];
        if (!thread) return;
        const parsed = parseAgentTags(text, { cards: tagCards, streaming });
        const trimmedReasoning = reasoning.trim();
        const reply: ThinkTankMessage = {
          id: replyId,
          speaker: "assistant",
          text: parsed.text,
          createdAt: this.now(),
          personaId: voice.id,
          personaName: voice.name,
          ...(voice.model ? { model: voice.model } : {}),
          segments: parsed.segments,
          rawText: text,
          ...(streaming ? { streaming: true } : {}),
          ...(trimmedReasoning ? { reasoning: trimmedReasoning } : {}),
          ...extra,
        };
        const messages = thread.messages
          .map(m => (m.speaker === "user" ? { ...m, pending: false } : m))
          .filter(m => m.id !== replyId);
        this.patchThread(roundtableId, { messages: [...messages, reply] });
      };

      const result = await gateway.designWorkspaceAgentTurn({
        briefing,
        apiKey,
        model: voice.model || (this.deps.host.model?.() ?? ""),
        systemPrompt: voice.systemPrompt ?? this.deps.host.systemPrompt?.(),
        webSearchEnabled: this.deps.host.webSearchEnabled?.(),
        onDelta: delta => {
          if (delta.text) text += delta.text;
          if (delta.reasoning) reasoning += delta.reasoning;
          render(true);
        },
      });

      text = result.text ?? text;
      reasoning = result.reasoning ?? reasoning;
      const citations = result.webCitations ?? [];

      render(false, ...([citations.length > 0 ? { webCitations: citations } : {}] as const));
      this.patchThread(roundtableId, { isThinking: false, error: null });
      await this.persist(roundtableId);
    } catch (error: any) {
      const thread = this.current.threads[roundtableId];
      this.patchThread(roundtableId, {
        isThinking: false,
        messages: (thread?.messages ?? [])
          .filter(m => m.id !== replyId)
          .map(m => (m.speaker === "user" ? { ...m, pending: false } : m)),
        error: `Couldn't reach the model: ${error?.message ?? "unknown error"}.`,
      });
    }
  }

  /**
   * The bounded briefing: workspace cards, numbered, plus this thread's own transcript —
   * and the same staging {@link WorkspaceAgentWorkflow} uses, so a voice on a think tank
   * gets the identical fix for the "whose lines are these" bug the ambient conversation
   * already had solved. Duplicated rather than imported: it is three sentences of pure
   * string-building with no shared state, and importing a private method across two
   * workflows would couple them for a paragraph of text.
   */
  private briefing(roundtableId: string, cards: Card[], speaking: AgentVoice, panel: AgentVoice[]): string {
    const thread = this.current.threads[roundtableId];
    const lines: string[] = [];

    const staging = stageDirection(speaking, panel, thread?.messages ?? []);
    if (staging) lines.push(staging, "");

    if (cards.length > 0) {
      lines.push("Cards in scope, numbered:");
      cards.forEach((card, index) => {
        lines.push(`${index + 1}. ${card.title}: ${card.body}`.slice(0, 600));
      });
    } else {
      lines.push("No cards are currently in scope.");
    }

    lines.push("\nConversation so far:");
    for (const message of thread?.messages ?? []) {
      const speaker =
        message.speaker === "assistant" && message.personaName ? message.personaName : message.speaker;
      lines.push(`${speaker}: ${message.text}`);
    }

    return lines.join("\n");
  }

  // --- Persistence ---

  private async persist(roundtableId: string): Promise<void> {
    const repo = this.deps.conversationRepo;
    const workspaceId = this.current.workspaceId;
    const thread = this.current.threads[roundtableId];
    if (!repo || !workspaceId || !thread) return;

    const messages = toConversationMessages(thread.messages);
    const draft = createConversation({
      workspaceId,
      id: thread.conversationId ?? undefined,
      messages,
      tagActions: toConversationTagActions(thread.tagActions),
      roundtableId: thread.roundtableId,
      roundtableName: thread.roundtableName,
      now: this.now(),
    });
    if (!isWorthSaving(draft)) return;

    try {
      await repo.saveConversation(draft);
      if (!thread.conversationId) {
        this.patchThread(roundtableId, { conversationId: draft.id });
      }
      this.refreshHistoryEntry(draft);
    } catch {
      // The board's own state is still correct; only the copy on disk is behind.
    }
  }

  /** Updates (or inserts) one row of the history list from a just-saved record. */
  private refreshHistoryEntry(saved: Conversation): void {
    const entry: ThinkTankHistoryEntry = {
      conversationId: saved.id,
      roundtableId: saved.roundtableId!,
      roundtableName: saved.roundtableName ?? "The table",
      title: saved.title,
      messageCount: saved.messages.length,
      updatedAt: saved.updatedAt,
    };
    const withoutOld = this.current.history.filter(h => h.roundtableId !== entry.roundtableId);
    this.patch({ history: sortHistory([...withoutOld, entry]) });
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private generateId(): string {
    return this.deps.generateId ? this.deps.generateId() : Math.random().toString(36).substring(2, 10);
  }
}

// --- Pure helpers ---

function toHistory(conversations: Conversation[]): ThinkTankHistoryEntry[] {
  return sortHistory(
    sortByRecency(conversations).map(conversation => ({
      conversationId: conversation.id,
      roundtableId: conversation.roundtableId!,
      roundtableName: conversation.roundtableName ?? "The table",
      title: conversation.title,
      messageCount: conversation.messages.length,
      updatedAt: conversation.updatedAt,
    }))
  );
}

function sortHistory(entries: ThinkTankHistoryEntry[]): ThinkTankHistoryEntry[] {
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt);
}

function toConversationMessages(messages: ThinkTankMessage[]): ConversationMessage[] {
  return messages
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

function toConversationTagActions(
  actions: Record<string, AgentTagAction>
): Record<string, { status: "done" | "failed"; resultMessage?: string }> {
  const settled: Record<string, { status: "done" | "failed"; resultMessage?: string }> = {};
  for (const [key, action] of Object.entries(actions)) {
    if (action.status === "pending") continue;
    settled[key] = {
      status: action.status,
      ...(action.resultMessage ? { resultMessage: action.resultMessage } : {}),
    };
  }
  return settled;
}

function fromConversationTagActions(
  actions: Record<string, { status: "done" | "failed"; resultMessage?: string }>
): Record<string, AgentTagAction> {
  const restored: Record<string, AgentTagAction> = {};
  for (const [key, action] of Object.entries(actions)) {
    restored[key] = { status: action.status, ...(action.resultMessage ? { resultMessage: action.resultMessage } : {}) };
  }
  return restored;
}

/** Re-parses saved raw text against the cards that exist *now* — same discipline as the ambient workflow. */
function toThreadMessage(
  message: ConversationMessage,
  tagCards: { id: string; title: string }[]
): ThinkTankMessage {
  if (message.speaker === "user") {
    return { id: message.id, speaker: "user", text: message.text, createdAt: message.createdAt };
  }
  const parsed = parseAgentTags(message.text, { cards: tagCards });
  return {
    id: message.id,
    speaker: "assistant",
    text: parsed.text,
    rawText: message.text,
    segments: parsed.segments,
    createdAt: message.createdAt,
    ...(message.personaId ? { personaId: message.personaId } : {}),
    ...(message.personaName ? { personaName: message.personaName } : {}),
    ...(message.model ? { model: message.model } : {}),
    ...(message.reasoning ? { reasoning: message.reasoning } : {}),
  };
}

/** The panel implied by a saved transcript: every distinct voice that actually spoke. */
function distinctSpeakers(messages: ConversationMessage[]): AgentVoice[] {
  const seen = new Map<string, AgentVoice>();
  for (const message of messages) {
    if (message.speaker !== "assistant" || !message.personaId || seen.has(message.personaId)) continue;
    seen.set(message.personaId, {
      id: message.personaId,
      name: message.personaName ?? message.personaId,
      model: message.model ?? "",
    });
  }
  return [...seen.values()];
}

function findTag(messages: ThinkTankMessage[], messageId: string, tagId: string): ParsedAgentTag | undefined {
  const message = messages.find(m => m.id === messageId);
  for (const segment of message?.segments ?? []) {
    if (segment.kind === "tag" && segment.tag.id === tagId) return segment.tag;
  }
  return undefined;
}

function nearestPrecedingUserText(messages: ThinkTankMessage[], messageId: string): string | null {
  const index = messages.findIndex(m => m.id === messageId);
  if (index === -1) return null;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (messages[i].speaker === "user") return messages[i].text;
  }
  return null;
}

/** Same staging `WorkspaceAgentWorkflow` uses — see this file's `briefing` doc for why it is duplicated. */
function stageDirection(speaking: AgentVoice, panel: AgentVoice[], transcript: ThinkTankMessage[]): string {
  const others = new Set<string>();
  for (const voice of panel) {
    if (voice.id !== speaking.id) others.add(voice.name);
  }
  for (const message of transcript) {
    if (message.speaker !== "assistant") continue;
    if (!message.personaName || message.personaName === speaking.name) continue;
    others.add(message.personaName);
  }

  if (others.size === 0) {
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
