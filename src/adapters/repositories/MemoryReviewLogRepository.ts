import { ReviewLog } from "../../entities/schedule";
import { ReviewLogRepository } from "./ReviewLogRepository";

/**
 * In-memory implementation of ReviewLogRepository for unit testing and fast operations.
 */
export class MemoryReviewLogRepository implements ReviewLogRepository {
  private logs: ReviewLog[] = [];

  async saveLog(log: ReviewLog): Promise<void> {
    const logTimestamp = new Date().toISOString();
    this.logs.push(log);
    console.log(`[${logTimestamp}] [MemoryReviewLogRepository.saveLog] Saved log for card ${log.cardId}`);
  }

  async getLogsByWorkspace(workspaceId: string): Promise<ReviewLog[]> {
    return this.logs.filter(l => l.workspaceId === workspaceId);
  }

  async getLogsByCard(cardId: string): Promise<ReviewLog[]> {
    return this.logs.filter(l => l.cardId === cardId);
  }
}
