import { Card } from "../../entities/card";
import {
  AgentToolIntent,
  normalizeWorkspaceAgentResponse,
  WorkspaceAgentProposedAction,
} from "../../entities/workspaceAgent";
import { AgentGateway } from "../ports/gateways/AgentGateway";
import { resolveScopedContext } from "../agent/AgentScope";

/**
 * # Workspace Agent Workflow (Phase C — validated model turns, no dispatch)
 *
 * ## Business Value & Purpose
 * Owns the "Ask GRIOT" conversation sheet's session-only state: is it open, for which
 * workspace/selection, what has been said, and what the model has proposed. Phase B had
 * no gateway wired in at all; this phase adds one real call per sent message —
 * `AgentGateway.designWorkspaceAgentTurn`, bounded by `resolveScopedContext` — but still
 * never *executes* a proposed tool action. Proposals are stored, inspectable, and inert;
 * wiring the confirm button to a real interactor is Phase D's job.
 *
 * ## The failure discipline
 * Exactly the same shape as `GoalArchitectWorkflow.requestAgentTurn`: no API key, no
 * gateway support, a network failure, or a malformed reply all set `agentError` and leave
 * everything else untouched — no cards created, no other interactor called, no proposals
 * fabricated from a broken response.
 *
 * Messages are session-only (never persisted): closing the conversation forgets it, the
 * same way a browser tab's scroll position resets on reload. Persistence is out of scope
 * for this increment.
 */

/** One line of the conversation. `pending` marks a user message with no reply yet. */
export interface WorkspaceAgentMessage {
  id: string;
  speaker: "user" | "assistant";
  text: string;
  createdAt: number;
  /** True for a just-sent user message while its reply is still in flight. */
  pending?: boolean;
}

/** What the sheet was opened for — informs the context chips and the bounded briefing. */
export interface WorkspaceAgentContext {
  selectedCardIds: string[];
  currentGroupId: string | null;
}

/**
 * A proposal shown to the user, plus its own lifecycle — never auto-executed.
 * "proposed" → "pending-dispatch" (confirm pressed, dispatch in flight) → "done" or
 * "failed" (dispatch settled, with a truthful `resultMessage`).
 */
export type WorkspaceAgentProposalStatus =
  | "proposed"
  | "pending-dispatch"
  | "done"
  | "failed";

export interface WorkspaceAgentProposalViewState {
  action: WorkspaceAgentProposedAction;
  status: WorkspaceAgentProposalStatus;
  /** Truthful, factual outcome once status is "done" or "failed". */
  resultMessage?: string;
}

export interface WorkspaceAgentState {
  isOpen: boolean;
  workspaceId: string | null;
  context: WorkspaceAgentContext;
  messages: WorkspaceAgentMessage[];
  /** Proposals from the most recent validated turn. Inspectable only — see Phase D. */
  proposals: WorkspaceAgentProposalViewState[];
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
  /** Resolved from the user-editable Workspace Agent assistant profile, if any. */
  systemPrompt?(): string;
  /** All cards in the active workspace, for bounded context + card-id validation. */
  allCards?(): Card[];
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
   * Phase D: dispatches one confirmed tool intent to the real interactor(s) and
   * resolves with a truthful, factual completion message, or rejects with an Error
   * whose message is a truthful, factual failure message. Never called except from
   * `confirmProposal` — never during `sendMessage`/proposal creation. Optional so the
   * sheet remains usable (transcript + inert proposals) without a controller wired in.
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
  proposals: [],
  isThinking: false,
  agentError: null,
};

export class WorkspaceAgentWorkflow {
  private current: WorkspaceAgentState = { ...EMPTY_STATE };

  constructor(private readonly deps: WorkspaceAgentWorkflowDeps) {}

  get state(): WorkspaceAgentState {
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
   * Confirms a proposal and dispatches it to the real interactor(s) via
   * `deps.dispatchTool` — the only place a tool action is ever executed. Nothing runs
   * merely because a proposal was shown; this method is the sole trigger.
   *
   * The proposal is marked "pending-dispatch" immediately (so the UI can disable the
   * button), then "done" or "failed" once the dispatch settles, with a truthful
   * `resultMessage` either way. A throwing dispatch never leaves the proposal silently
   * stuck — it always resolves to a terminal status.
   */
  async confirmProposal(id: string): Promise<void> {
    const target = this.current.proposals.find(p => p.action.id === id);
    if (!target || target.status !== "proposed") return;

    const setStatus = (status: WorkspaceAgentProposalStatus, resultMessage?: string): void => {
      this.patch({
        proposals: this.current.proposals.map(p =>
          p.action.id === id ? { ...p, status, resultMessage } : p
        ),
      });
    };

    setStatus("pending-dispatch");

    const dispatch = this.deps.dispatchTool;
    if (!dispatch) {
      setStatus("done", "Noted — nothing to run for this action.");
      return;
    }

    try {
      const message = await dispatch(target.action.tool, this.current.context);
      setStatus("done", message);
    } catch (error: any) {
      setStatus("failed", error?.message ?? "That didn't complete. Nothing was changed.");
    }
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

    try {
      const allCards = this.deps.host.allCards?.() ?? [];
      const scoped = resolveScopedContext({
        scope: "workspace",
        allCards,
        selectedCards: allCards.filter(c => this.current.context.selectedCardIds.includes(c.id)),
        parentId: this.current.context.currentGroupId,
      });

      const result = await gateway.designWorkspaceAgentTurn({
        briefing: this.briefing(scoped.cards),
        apiKey,
        model: this.deps.host.model?.() ?? "",
        systemPrompt: this.deps.host.systemPrompt?.(),
      });

      const validCardIds = new Set(allCards.map(c => c.id));
      const turn = normalizeWorkspaceAgentResponse(result.raw, validCardIds);
      if (!turn) {
        this.patch({
          isThinking: false,
          agentError:
            "The model's reply didn't come back in a usable shape. Nothing was proposed or changed — try again.",
        });
        return;
      }

      const reply: WorkspaceAgentMessage | null = turn.message
        ? {
            id: this.generateId(),
            speaker: "assistant",
            text: turn.message,
            createdAt: this.now(),
          }
        : null;

      // The user's own message is no longer awaiting a reply, whether or not the model
      // had prose to add — a turn with only proposals still answers it.
      const messages = this.current.messages.map(m => ({ ...m, pending: false }));

      this.patch({
        isThinking: false,
        messages: reply ? [...messages, reply] : messages,
        proposals: turn.proposedActions.map(action => ({
          action,
          status: "proposed" as const,
        })),
      });
    } catch (error: any) {
      this.patch({
        isThinking: false,
        agentError: `Couldn't reach the model: ${error?.message ?? "unknown error"}.`,
      });
    }
  }

  /** The bounded briefing sent to the model — the scoped cards plus the transcript so far. */
  private briefing(cards: Card[]): string {
    const lines: string[] = [];

    if (cards.length > 0) {
      lines.push("Cards in scope (id, type, title, body):");
      for (const card of cards) {
        lines.push(`- [${card.id}] (${card.type}) ${card.title}: ${card.body}`.slice(0, 600));
      }
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
