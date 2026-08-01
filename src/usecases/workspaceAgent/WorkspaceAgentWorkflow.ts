import { Card } from "../../entities/card";
import { AgentToolIntent } from "../../entities/workspaceAgent";
import {
  AgentMessageSegment,
  ParsedAgentTag,
  parseAgentTags,
} from "../../entities/agentTags";
import { AgentGateway } from "../ports/gateways/AgentGateway";
import { WebCitation } from "../../entities/webCitation";
import { resolveScopedContext } from "../agent/AgentScope";

/**
 * # Workspace Agent Workflow — a streamed conversation with taggable artifacts
 *
 * ## Business Value & Purpose
 * Owns the "Ask GRIOT" conversation sheet's session-only state: is it open, for which
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
 * Messages are session-only (never persisted): closing the conversation forgets it.
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

/** One line of the conversation. `pending` marks a user message with no reply yet. */
export interface WorkspaceAgentMessage {
  id: string;
  speaker: "user" | "assistant";
  text: string;
  createdAt: number;
  /** True for a just-sent user message while its reply is still in flight. */
  pending?: boolean;
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
  messages: WorkspaceAgentMessage[];
  /**
   * What has become of each tag the user pressed `+` on, keyed `messageId:tagId`. A tag
   * with no entry here has never been acted on — which is every tag, until a tap.
   */
  tagActions: Record<string, WorkspaceAgentTagAction>;
  isThinking: boolean;
  /** An actionable failure (no key, no gateway support, network error, malformed reply). */
  agentError: string | null;
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
}

const EMPTY_CONTEXT: WorkspaceAgentContext = {
  selectedCardIds: [],
  currentGroupId: null,
};

const EMPTY_STATE: WorkspaceAgentState = {
  isOpen: false,
  workspaceId: null,
  context: EMPTY_CONTEXT,
  messages: [],
  tagActions: {},
  isThinking: false,
  agentError: null,
};

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
    }
    return this.current;
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

  /** Closes the sheet. Session-only, so the transcript and proposals are forgotten with it. */
  closeConversation(): void {
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
  async sendMessage(text: string): Promise<void> {
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

    await this.requestTurn();
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
  }

  /** The tag a `+` belongs to, or undefined — never a tag from a different message. */
  private findTag(messageId: string, tagId: string): ParsedAgentTag | undefined {
    const message = this.current.messages.find(m => m.id === messageId);
    for (const segment of message?.segments ?? []) {
      if (segment.kind === "tag" && segment.tag.id === tagId) return segment.tag;
    }
    return undefined;
  }

  private async requestTurn(): Promise<void> {
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

      const briefing = this.briefing(scoped.cards, new Set(focusIds));
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
          sentContext,
          segments: parsed.segments,
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
        model: this.deps.host.model?.() ?? "",
        systemPrompt: this.deps.host.systemPrompt?.(),
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
  private briefing(cards: Card[], focusIds: Set<string> = new Set()): string {
    const lines: string[] = [];

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
      lines.push(`${message.speaker}: ${message.text}`);
    }

    return lines.join("\n");
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
