import { Conversation } from "../../entities/conversation";
import { ConversationRepository } from "../../usecases/ports/repositories/ConversationRepository";
import { KeyValueStore } from "./KeyValueStore";
import { JsonCollectionStore, JsonStoreOptions, removeById, upsert } from "./JsonStore";

/**
 * Storage key. The `learnimal_` prefix is deliberate and must not be renamed with the
 * rest of the app: it is the on-disk contract, and changing it would orphan every
 * workspace, card, and setting a user already has.
 */
const CONVERSATIONS_KEY = "learnimal_conversations_v1";

const conversationId = (conversation: Conversation) => conversation.id;

/** Persists Ask GRIOT transcripts locally, available offline. */
export class AsyncStorageConversationRepository implements ConversationRepository {
  private readonly conversations: JsonCollectionStore<Conversation>;

  constructor(store: KeyValueStore, options?: JsonStoreOptions) {
    this.conversations = new JsonCollectionStore(
      CONVERSATIONS_KEY,
      store,
      "conversations",
      options,
    );
  }

  async getConversations(workspaceId: string): Promise<Conversation[]> {
    const all = await this.conversations.readAll();
    return all.filter((conversation) => conversation.workspaceId === workspaceId);
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const all = await this.conversations.readAll();
    return all.find((conversation) => conversation.id === id);
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    await this.conversations.mutate((all) => upsert(all, conversation, conversationId));
  }

  async deleteConversation(id: string): Promise<void> {
    await this.conversations.mutate((all) => removeById(all, id, conversationId));
  }
}
