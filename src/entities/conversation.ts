/**
 * # Conversation — an Ask GRIOT session that outlives the sheet
 *
 * ## Business Value & Purpose
 * The workspace agent's transcript used to vanish the moment the sheet closed. That was
 * defensible while a turn was a throwaway question, but the conversation is now where the
 * learner's goal actually gets sharpened — several turns of Socratic back-and-forth, often
 * across more than one persona. Losing that on a stray tap loses the thinking, not just
 * the text.
 *
 * So a conversation is now a saved thing, per workspace, listed newest-first behind the
 * sheet's HISTORY button.
 *
 * ## What is stored, and why it is the *raw* text
 * Assistant turns are persisted exactly as the model wrote them — tags and all — rather
 * than as the rendered prose. Re-parsing on load is what lets a restored transcript show
 * its chips again, so a note the user never got round to adding is still one tap away
 * weeks later. Segments are therefore derived, never stored: there is one source of truth
 * for what the model said, and it is the string it actually produced.
 *
 * ## The honesty rule this file exists to keep
 * {@link ConversationTagAction} records what became of each `+`. Without it a restored
 * conversation would offer a fresh `+` on a tag whose card already exists, and the user
 * would silently create it twice. A `pending` action is deliberately *not* saved: it means
 * a dispatch was in flight when the app went away, and neither "it worked" nor "it failed"
 * is something we know. Dropping it makes the chip actionable again, which is the
 * recoverable direction — the alternative is a chip disabled forever over an outcome we
 * never observed.
 */

/** What became of one tag's `+`. Mirrors the workflow's own record, minus `pending`. */
export interface ConversationTagAction {
  status: "done" | "failed";
  /** The dispatcher's own truthful message. */
  resultMessage?: string;
}

/** One saved line of a conversation. */
export interface ConversationMessage {
  id: string;
  speaker: "user" | "assistant";
  /**
   * For an assistant turn, the model's reply **verbatim**, tags included — see the module
   * note above. For a user turn, simply what they typed.
   */
  text: string;
  createdAt: number;
  /** Which voice answered, and on what model. Assistant turns only. */
  personaId?: string;
  personaName?: string;
  model?: string;
  /** The model's own reasoning, when the provider returned any. Never synthesized. */
  reasoning?: string;
}

export interface Conversation {
  id: string;
  workspaceId: string;
  /** What the history list shows. Derived from the opening message — see {@link conversationTitle}. */
  title: string;
  messages: ConversationMessage[];
  /** Settled tag outcomes, keyed `messageId:tagId`. */
  tagActions: Record<string, ConversationTagAction>;
  createdAt: number;
  updatedAt: number;
}

/** Longest title the history list can show without truncating mid-row. */
const TITLE_LIMIT = 60;

/** Shown for a conversation saved before its first user message landed. */
export const UNTITLED_CONVERSATION = "New conversation";

/**
 * A readable title from the opening message: the first line, cut at a word boundary.
 *
 * Deliberately derived rather than model-generated — naming the conversation is not worth
 * a round trip, and a title that appears instantly is worth more than a clever one.
 */
export function conversationTitle(firstUserMessage: string): string {
  const firstLine = (firstUserMessage ?? "").trim().split("\n")[0].trim();
  if (!firstLine) return UNTITLED_CONVERSATION;
  if (firstLine.length <= TITLE_LIMIT) return firstLine;

  const clipped = firstLine.slice(0, TITLE_LIMIT);
  const lastSpace = clipped.lastIndexOf(" ");
  // Only respect the word boundary if it leaves a usable amount of the sentence.
  const stem = lastSpace > TITLE_LIMIT / 2 ? clipped.slice(0, lastSpace) : clipped;
  return `${stem.trimEnd()}…`;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export interface CreateConversationParams {
  workspaceId: string;
  id?: string;
  title?: string;
  messages?: ConversationMessage[];
  tagActions?: Record<string, ConversationTagAction>;
  now?: number;
}

export function createConversation(params: CreateConversationParams): Conversation {
  const now = params.now ?? Date.now();
  const messages = params.messages ?? [];
  return {
    id: params.id || `conv-${generateId()}`,
    workspaceId: params.workspaceId,
    title: params.title?.trim() || titleFromMessages(messages),
    messages,
    tagActions: params.tagActions ?? {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Re-derives a conversation's title from its first user message.
 *
 * The *first* rather than the most recent on purpose: the opening question is what the
 * learner will recognise the conversation by, and a title that changed every turn would
 * make the history list impossible to scan.
 */
export function titleFromMessages(messages: ConversationMessage[]): string {
  const opening = messages.find(message => message.speaker === "user");
  return opening ? conversationTitle(opening.text) : UNTITLED_CONVERSATION;
}

/** A conversation updated to hold `messages`, re-titled if it had no real title yet. */
export function withMessages(
  conversation: Conversation,
  messages: ConversationMessage[],
  tagActions: Record<string, ConversationTagAction>,
  now: number = Date.now()
): Conversation {
  const keepsTitle =
    conversation.title.trim() && conversation.title !== UNTITLED_CONVERSATION;
  return {
    ...conversation,
    title: keepsTitle ? conversation.title : titleFromMessages(messages),
    messages,
    tagActions,
    updatedAt: now,
  };
}

/** Newest first — the order the history list reads in. */
export function sortByRecency(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Whether a conversation is worth keeping: it must contain something the user said.
 *
 * Opening the sheet and closing it again is not a conversation, and a history list full
 * of empty rows is worse than no history at all.
 */
export function isWorthSaving(conversation: Conversation): boolean {
  return conversation.messages.some(
    message => message.speaker === "user" && message.text.trim().length > 0
  );
}
