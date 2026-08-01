import { Card } from "../../entities/card";
import { CardRepository } from "../../usecases/ports/repositories/CardRepository";
import { KeyValueStore } from "./KeyValueStore";
import {
  JsonCollectionStore,
  JsonStoreOptions,
  removeById,
  upsert,
  upsertAll,
} from "./JsonStore";

/**
 * Storage key. The `learnimal_` prefix is deliberate and must not be renamed with the
 * rest of the app: it is the on-disk contract, and changing it would orphan every
 * workspace, card, and setting a user already has.
 */
const CARDS_STORAGE_KEY = "learnimal_cards_v1";

const cardId = (card: Card) => card.id;

/**
 * # AsyncStorage Card Repository
 *
 * ## Business Value & Purpose
 * Durable local storage for the user's cards. Every method goes through
 * {@link JsonCollectionStore}, so a failed read surfaces as a `PersistenceError` rather
 * than an empty deck — and no save can overwrite the user's cards with the result of a
 * read that didn't work.
 */
export class AsyncStorageCardRepository implements CardRepository {
  private readonly cards: JsonCollectionStore<Card>;

  constructor(store: KeyValueStore, options?: JsonStoreOptions) {
    this.cards = new JsonCollectionStore(CARDS_STORAGE_KEY, store, "cards", options);
  }

  async getCardsByWorkspace(workspaceId: string): Promise<Card[]> {
    const all = await this.cards.readAll();
    return all.filter((card) => card.workspaceId === workspaceId);
  }

  async saveCard(card: Card): Promise<void> {
    await this.cards.mutate((all) => upsert(all, card, cardId));
  }

  async saveCards(cards: Card[]): Promise<void> {
    await this.cards.mutate((all) => upsertAll(all, cards, cardId));
  }

  async deleteCard(id: string): Promise<void> {
    await this.cards.mutate((all) => removeById(all, id, cardId));
  }

  async getCard(id: string): Promise<Card | null> {
    const all = await this.cards.readAll();
    return all.find((card) => card.id === id) ?? null;
  }
}
