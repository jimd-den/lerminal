import { CardTypeDefinition } from "../../entities/cardTypeDefinition";
import { CardTypeRepository } from "../../usecases/ports/repositories/CardTypeRepository";
import { KeyValueStore } from "./KeyValueStore";
import { JsonCollectionStore, JsonStoreOptions, removeById, upsert } from "./JsonStore";

/**
 * Storage key. The `learnimal_` prefix is deliberate and must not be renamed with the
 * rest of the app: it is the on-disk contract, and changing it would orphan every
 * workspace, card, and setting a user already has.
 */
const CARD_TYPES_KEY = "learnimal_card_types_v1";

const typeId = (definition: CardTypeDefinition) => definition.id;

/**
 * # AsyncStorage Card Type Repository
 *
 * ## Business Value & Purpose
 * Persists the card type registry, keeping the user's custom card vocabulary (and any
 * restyled built-ins) available offline and across launches.
 */
export class AsyncStorageCardTypeRepository implements CardTypeRepository {
  private readonly types: JsonCollectionStore<CardTypeDefinition>;

  constructor(store: KeyValueStore, options?: JsonStoreOptions) {
    this.types = new JsonCollectionStore(CARD_TYPES_KEY, store, "cardTypes", options);
  }

  async getTypes(): Promise<CardTypeDefinition[]> {
    return this.types.readAll();
  }

  async saveType(definition: CardTypeDefinition): Promise<void> {
    await this.types.mutate((all) => upsert(all, definition, typeId));
  }

  async deleteType(id: string): Promise<void> {
    await this.types.mutate((all) => removeById(all, id, typeId));
  }
}
