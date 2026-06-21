import { Card } from "../../entities/card";
import { NothingDueError } from "../errors";

/**
 * Reorders a queue so consecutive cards come from different parent groups/topics
 * (round-robin by `parentId`). Interleaving practice across topics is a well-supported
 * learning technique: it forces discrimination between concepts and improves retention
 * versus blocking all of one topic together. Order within a topic is preserved.
 */
function interleaveByTopic(cards: Card[]): Card[] {
  const buckets = new Map<string, Card[]>();
  for (const card of cards) {
    const key = card.parentId ?? "__root__";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(card);
    else buckets.set(key, [card]);
  }

  const queues = Array.from(buckets.values());
  const result: Card[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (next) {
        result.push(next);
        added = true;
      }
    }
  }
  return result;
}

/**
 * # Start Review Interactor
 *
 * ## Business Value & Purpose
 * Builds the queue for a spaced-repetition session from the workspace's scheduled
 * question cards. Due cards are preferred; if none are due, it falls back to all
 * scheduled questions so the user can always practice. When interleaving is enabled,
 * the queue is reordered to mix topics. Pure domain logic — cards in, ordered queue out.
 */
export class StartReviewInteractor {
  /**
   * @param cards All cards in the active workspace.
   * @param now Current epoch milliseconds.
   * @param interleave When true (default), mix cards across topics/groups.
   * @returns The review queue.
   * @throws {NothingDueError} when there are no scheduled question cards at all.
   */
  execute(cards: Card[], now: number, interleave: boolean = true): Card[] {
    let due = cards.filter(
      c => c.type === "question" && c.schedule && c.schedule.dueAt <= now
    );

    if (due.length === 0) {
      due = cards.filter(c => c.type === "question" && c.schedule);
    }

    if (due.length === 0) {
      throw new NothingDueError();
    }

    return interleave ? interleaveByTopic(due) : due;
  }
}
