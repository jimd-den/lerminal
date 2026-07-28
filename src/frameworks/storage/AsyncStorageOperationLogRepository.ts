import AsyncStorage from "@react-native-async-storage/async-storage";
import { OperationRecord } from "../../entities/operationLog";
import { OperationLogRepository } from "../../adapters/repositories/OperationLogRepository";

const STORAGE_KEY = "learnimal_operation_log_v1";

/** Hard cap on stored records (across all workspaces) so the log never grows unbounded. */
const MAX_RECORDS = 200;

/**
 * # AsyncStorage Operation Log Repository
 *
 * ## Business Value & Purpose
 * Persists run receipts / undo snapshots to React Native's local key-value store so they
 * survive app restarts. Bounded to the most recent {@link MAX_RECORDS}: once exceeded, the
 * oldest records are pruned first (oldest-first, by `completedAt`).
 */
export class AsyncStorageOperationLogRepository implements OperationLogRepository {
  private async loadAll(): Promise<OperationRecord[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as OperationRecord[]) : [];
    } catch (err: any) {
      console.error("[AsyncStorageOperationLogRepository] Failed to read log from disk:", err.message);
      return [];
    }
  }

  private async saveAll(records: OperationRecord[]): Promise<void> {
    try {
      const bounded = records
        .sort((a, b) => b.completedAt - a.completedAt)
        .slice(0, MAX_RECORDS);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(bounded));
    } catch (err: any) {
      console.error("[AsyncStorageOperationLogRepository] Failed to write log to disk:", err.message);
    }
  }

  async getRecords(workspaceId: string): Promise<OperationRecord[]> {
    const all = await this.loadAll();
    return all
      .filter(r => r.workspaceId === workspaceId)
      .sort((a, b) => b.completedAt - a.completedAt);
  }

  async getRecord(id: string): Promise<OperationRecord | null> {
    const all = await this.loadAll();
    return all.find(r => r.id === id) || null;
  }

  async saveRecord(record: OperationRecord): Promise<void> {
    const all = await this.loadAll();
    const index = all.findIndex(r => r.id === record.id);
    if (index >= 0) {
      all[index] = record;
    } else {
      all.push(record);
    }
    await this.saveAll(all);
  }

  async deleteRecord(id: string): Promise<void> {
    const all = await this.loadAll();
    await this.saveAll(all.filter(r => r.id !== id));
  }
}
