import AsyncStorage from "@react-native-async-storage/async-storage";
import { ReviewLog } from "../../entities/schedule";
import { ReviewLogRepository } from "../../adapters/repositories/ReviewLogRepository";

const STORAGE_KEY = "@chunk_buddy_review_logs";

export class AsyncStorageReviewLogRepository implements ReviewLogRepository {
  private async loadAll(): Promise<ReviewLog[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async saveLog(log: ReviewLog): Promise<void> {
    const logs = await this.loadAll();
    logs.push(log);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  }

  async getLogsByWorkspace(workspaceId: string): Promise<ReviewLog[]> {
    const logs = await this.loadAll();
    return logs.filter(l => l.workspaceId === workspaceId);
  }

  async getLogsByCard(cardId: string): Promise<ReviewLog[]> {
    const logs = await this.loadAll();
    return logs.filter(l => l.cardId === cardId);
  }
}
