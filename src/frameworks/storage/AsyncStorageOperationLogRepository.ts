import { OperationRecord } from "../../entities/operationLog";
import { OperationLogRepository } from "../../usecases/ports/repositories/OperationLogRepository";
import { KeyValueStore } from "./KeyValueStore";
import { JsonCollectionStore, JsonStoreOptions, removeById, upsert } from "./JsonStore";

const STORAGE_KEY = "learnimal_operation_log_v1";

/** Hard cap on stored records (across all workspaces) so the log never grows unbounded. */
const MAX_RECORDS = 200;

const recordId = (record: OperationRecord) => record.id;

/** Newest first — the order the receipt UI and undo both want. */
const newestFirst = (a: OperationRecord, b: OperationRecord) => b.completedAt - a.completedAt;

/** Keeps only the most recent {@link MAX_RECORDS}, dropping the oldest. Pure. */
const bounded = (records: OperationRecord[]): OperationRecord[] =>
  [...records].sort(newestFirst).slice(0, MAX_RECORDS);

/**
 * # AsyncStorage Operation Log Repository
 *
 * ## Business Value & Purpose
 * Persists run receipts and undo snapshots so "undo the last run" survives an app
 * restart. Bounded to the most recent {@link MAX_RECORDS}; pruning happens as part of
 * the same locked read-modify-write that saves, so trimming can never race a save.
 */
export class AsyncStorageOperationLogRepository implements OperationLogRepository {
  private readonly records: JsonCollectionStore<OperationRecord>;

  constructor(store: KeyValueStore, options?: JsonStoreOptions) {
    this.records = new JsonCollectionStore(STORAGE_KEY, store, "operationLog", options);
  }

  async getRecords(workspaceId: string): Promise<OperationRecord[]> {
    const all = await this.records.readAll();
    return all.filter((record) => record.workspaceId === workspaceId).sort(newestFirst);
  }

  async getRecord(id: string): Promise<OperationRecord | null> {
    const all = await this.records.readAll();
    return all.find((record) => record.id === id) ?? null;
  }

  async saveRecord(record: OperationRecord): Promise<void> {
    await this.records.mutate((all) => bounded(upsert(all, record, recordId)));
  }

  async deleteRecord(id: string): Promise<void> {
    await this.records.mutate((all) => removeById(all, id, recordId));
  }
}
