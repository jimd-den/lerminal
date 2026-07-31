import { ReviewLog } from "../../entities/schedule";
import { ReviewLogRepository } from "../../usecases/ports/repositories/ReviewLogRepository";
import { KeyValueStore } from "./KeyValueStore";
import { JsonCollectionStore, JsonStoreOptions } from "./JsonStore";

const STORAGE_KEY = "@chunk_buddy_review_logs";

/**
 * # AsyncStorage Review Log Repository
 *
 * ## Business Value & Purpose
 * The append-only record of every grade the user has given. It is the raw material for
 * scheduling accuracy, so losing entries silently would degrade recall predictions with
 * no visible symptom — appends go through the store's lock and failures surface.
 */
export class AsyncStorageReviewLogRepository implements ReviewLogRepository {
  private readonly logs: JsonCollectionStore<ReviewLog>;

  constructor(store: KeyValueStore, options?: JsonStoreOptions) {
    this.logs = new JsonCollectionStore(STORAGE_KEY, store, "reviewLogs", options);
  }

  async saveLog(log: ReviewLog): Promise<void> {
    await this.logs.mutate((all) => [...all, log]);
  }

  async getLogsByWorkspace(workspaceId: string): Promise<ReviewLog[]> {
    const all = await this.logs.readAll();
    return all.filter((log) => log.workspaceId === workspaceId);
  }

  async getLogsByCard(cardId: string): Promise<ReviewLog[]> {
    const all = await this.logs.readAll();
    return all.filter((log) => log.cardId === cardId);
  }
}
