import { Card } from "../../entities/card";
import { NothingDueError } from "../errors";

/**
 * # Start Review Interactor
 *
 * ## Business Value & Purpose
 * Builds the queue for a spaced-repetition session from the workspace's scheduled
 * question cards. Due cards are preferred; if none are due, it falls back to all
 * scheduled questions so the user can always practice. Pure domain logic — it
 * reads cards in and returns the ordered queue out.
 */
export class StartReviewInteractor {
  /**
   * @param cards All cards in the active workspace.
   * @param now Current epoch milliseconds.
   * @returns The review queue.
   * @throws {NothingDueError} when there are no scheduled question cards at all.
   */
  execute(cards: Card[], now: number): Card[] {
    let due = cards.filter(
      c => c.type === "question" && c.schedule && c.schedule.dueAt <= now
    );

    if (due.length === 0) {
      due = cards.filter(c => c.type === "question" && c.schedule);
    }

    if (due.length === 0) {
      throw new NothingDueError();
    }

    return due;
  }
}
