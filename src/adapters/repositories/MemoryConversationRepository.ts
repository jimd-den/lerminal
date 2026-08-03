import { Conversation } from "../../entities/conversation";
import { ConversationRepository } from "../../usecases/ports/repositories/ConversationRepository";

/** In-memory conversation store for tests and zero-latency fallbacks. */
export class MemoryConversationRepository implements ConversationRepository {
  private conversations: Map<string, Conversation> = new Map();

  async getConversations(workspaceId: string): Promise<Conversation[]> {
    return Array.from(this.conversations.values()).filter(
      (conversation) => conversation.workspaceId === workspaceId,
    );
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    this.conversations.set(conversation.id, conversation);
  }

  async deleteConversation(id: string): Promise<void> {
    this.conversations.delete(id);
  }
}
