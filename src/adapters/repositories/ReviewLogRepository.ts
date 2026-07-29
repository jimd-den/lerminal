import { ReviewLog } from "../../entities/schedule";

/**
 * # Review Log Repository Port
 *
 * ## Business Value & Purpose
 * Defines the contract for persisting immutable review history logs. Every time a card
 * is reviewed in an FSRS session, a `ReviewLog` entry is appended to track memory performance,
 * interval progression, and stability history over time.
 */
export interface ReviewLogRepository {
  /** Saves a new immutable review log entry. */
  saveLog(log: ReviewLog): Promise<void>;
  /** Retrieves all review logs for a given workspace. */
  getLogsByWorkspace(workspaceId: string): Promise<ReviewLog[]>;
  /** Retrieves all review logs for a specific card. */
  getLogsByCard(cardId: string): Promise<ReviewLog[]>;
}
