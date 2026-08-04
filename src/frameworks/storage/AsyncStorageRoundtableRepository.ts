import { Roundtable } from "../../entities/roundtable";
import { RoundtableRepository } from "../../usecases/ports/repositories/RoundtableRepository";
import { KeyValueStore } from "./KeyValueStore";
import { JsonCollectionStore, JsonStoreOptions, removeById, upsert } from "./JsonStore";

/**
 * Storage key. New in this feature, so it carries the app's current name rather than the
 * `learnimal_` prefix the older keys are stuck with — that prefix is an on-disk contract
 * for data that already exists, not a convention worth extending.
 */
const ROUNDTABLES_KEY = "griot_roundtables_v1";

const roundtableId = (roundtable: Roundtable) => roundtable.id;

/**
 * # AsyncStorage Roundtable Repository
 *
 * ## Business Value & Purpose
 * Keeps the user's saved panels between sessions.
 */
export class AsyncStorageRoundtableRepository implements RoundtableRepository {
  private readonly roundtables: JsonCollectionStore<Roundtable>;

  constructor(store: KeyValueStore, options?: JsonStoreOptions) {
    this.roundtables = new JsonCollectionStore(
      ROUNDTABLES_KEY,
      store,
      "roundtables",
      options,
    );
  }

  async getRoundtables(): Promise<Roundtable[]> {
    return this.roundtables.readAll();
  }

  async saveRoundtable(roundtable: Roundtable): Promise<void> {
    await this.roundtables.mutate((all) => upsert(all, roundtable, roundtableId));
  }

  async deleteRoundtable(id: string): Promise<void> {
    await this.roundtables.mutate((all) => removeById(all, id, roundtableId));
  }
}
