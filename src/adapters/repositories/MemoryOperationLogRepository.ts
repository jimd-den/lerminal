import { OperationRecord } from "../../entities/operationLog";
import { OperationLogRepository } from "../../usecases/ports/repositories/OperationLogRepository";

/**
 * # Memory Operation Log Repository
 *
 * ## Business Value & Purpose
 * An in-memory implementation of the OperationLogRepository contract, for tests and as
 * a zero-latency fallback, mirroring the Memory* pattern used by every other repository.
 */
export class MemoryOperationLogRepository implements OperationLogRepository {
  private records: Map<string, OperationRecord> = new Map();

  async getRecords(workspaceId: string): Promise<OperationRecord[]> {
    return Array.from(this.records.values())
      .filter(r => r.workspaceId === workspaceId)
      .sort((a, b) => b.completedAt - a.completedAt);
  }

  async getRecord(id: string): Promise<OperationRecord | null> {
    return this.records.get(id) || null;
  }

  async saveRecord(record: OperationRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async deleteRecord(id: string): Promise<void> {
    this.records.delete(id);
  }
}
