import { OperationRecord } from "../../../entities/operationLog";

/**
 * # Operation Log Repository Port
 *
 * ## Business Value & Purpose
 * Persists {@link OperationRecord} run receipts across app restarts, decoupled from the
 * underlying storage engine (AsyncStorage, Memory), the same way every other repository
 * in this app is. Implementations are expected to bound the log (e.g. most recent N
 * records) rather than grow unboundedly.
 */
export interface OperationLogRepository {
  /** Retrieves records for a workspace, most recent first. */
  getRecords(workspaceId: string): Promise<OperationRecord[]>;
  /** Retrieves a single record by id, or null if not found (e.g. pruned). */
  getRecord(id: string): Promise<OperationRecord | null>;
  /** Persists a new operation record. */
  saveRecord(record: OperationRecord): Promise<void>;
  /** Removes a record (e.g. after a successful undo). */
  deleteRecord(id: string): Promise<void>;
}
