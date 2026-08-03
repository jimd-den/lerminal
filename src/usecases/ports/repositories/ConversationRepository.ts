import { Conversation } from "../../../entities/conversation";

/**
 * # Conversation Repository Interface
 *
 * Persists Ask GRIOT transcripts so a conversation survives closing the sheet, and the
 * app's restart. Scoped reads are by workspace, because a conversation is only meaningful
 * beside the cards it was about.
 */
export interface ConversationRepository {
  /** Every saved conversation for one workspace. Order is the caller's concern. */
  getConversations(workspaceId: string): Promise<Conversation[]>;
  /** One conversation by id, or undefined if it was never saved or has been deleted. */
  getConversation(id: string): Promise<Conversation | undefined>;
  saveConversation(conversation: Conversation): Promise<void>;
  deleteConversation(id: string): Promise<void>;
}
