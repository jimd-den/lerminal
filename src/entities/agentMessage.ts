import { WebCitation } from "./webCitation";
import { AgentMessageSegment } from "./agentTags";

/**
 * # Agent Turn Message — the shape of one line in *any* agent conversation
 *
 * ## Business Value & Purpose
 * Both the ambient "Ask GRIOT" conversation (`usecases/workspaceAgent`) and the Bridge's
 * think-tank threads (`usecases/thinkTank`) are, underneath, the same thing: a sequence of
 * turns, some from the user, some from a named voice, some still streaming in. Before this
 * file existed that shape was defined once, privately, inside the ambient workflow, and a
 * second workflow needing it would have had to either import a usecases-layer type across
 * an unrelated feature or silently drift from it by redefining its own. Neither is clean
 * architecture: a domain concept two use-cases both need belongs in entities, where either
 * can depend on it without depending on each other.
 *
 * ## What stayed behind, deliberately
 * `WorkspaceAgentMessage` (the ambient workflow's own type) adds one field this base does
 * not carry: `sentContext`, the audit disclosure of exactly which cards and selection rode
 * along with a turn. That concept is specific to a conversation that scopes itself to
 * whatever the user has selected or has open — a think tank thread has no such per-turn
 * scope to disclose, so it is not forced to carry a field that would always be empty.
 * `WorkspaceAgentMessage` extends this interface with that one addition; nothing else about
 * it differs.
 */
export interface AgentTurnMessage {
  id: string;
  speaker: "user" | "assistant";
  text: string;
  createdAt: number;
  /** True for a just-sent user message while its reply is still in flight. */
  pending?: boolean;
  /**
   * Who said it and on what model. Assistant messages only, and recorded from the persona
   * the turn was actually sent as — never relabelled afterwards, so a transcript with
   * several voices in it stays honest about which one said what, even after the model or
   * the active speaker changes later.
   */
  personaId?: string;
  personaName?: string;
  model?: string;
  /**
   * Sources the model's provider actually consulted for *this* reply — the receipts.
   *
   * Attached to the message rather than held once per conversation so a later turn that
   * consulted nothing cannot inherit an earlier turn's sources. Present only when real
   * citations came back; never derived from a search-enabled setting.
   */
  webCitations?: WebCitation[];
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
   * True while tokens are still arriving for this message. The reader renders the partial
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
 * What has happened to one tag's `+`, wherever it was pressed. Keyed `messageId:tagId` by
 * whichever workflow owns the transcript; absent means untouched, the only state in which
 * anything can be dispatched.
 */
export interface AgentTagAction {
  status: "pending" | "done" | "failed";
  /** Truthful, factual outcome once the dispatch settles. */
  resultMessage?: string;
}

/** The key one tag's action is stored under. Message-scoped, so two turns never collide. */
export function agentTagActionKey(messageId: string, tagId: string): string {
  return `${messageId}:${tagId}`;
}

/**
 * A voice ready to be asked: a name, the model that speaks it, and the behaviour body
 * that shapes it — already resolved from whatever profile/persona record it came from, so
 * the workflow asking it never has to know that record's shape.
 *
 * Shared by the ambient conversation's persona list and a think-tank thread's fixed
 * panel: both are, underneath, "who answers, and how" — the same question asked of a
 * single voice or of several.
 */
export interface AgentVoice {
  id: string;
  name: string;
  /** Already resolved: the voice's pinned model, or the app's current selection. */
  model: string;
  /**
   * The voice's behaviour body. Undefined means "speak as plain GRIOT". Only the *body* —
   * the parent rules and the tag contract are appended downstream either way, so a voice
   * can change the manner and never the trust boundary or what the app can parse.
   */
  systemPrompt?: string;
}
