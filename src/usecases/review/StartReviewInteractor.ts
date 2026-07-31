import { Card } from "../../entities/card";
import { CardTypeDefinition, isSchedulable } from "../../entities/cardTypeDefinition";
import { NothingDueError } from "../errors";

/**
 * Reorders a queue so consecutive cards come from different parent groups/topics
 * (round-robin by `parentId`) to force discrimination between concepts.
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
 * Builds the FSRS study queue for a review session.
 * In standard review mode (`cram: false`), only cards that are due (`dueAt <= now`) and
 * schedulable (`isSchedulable`) enter the queue. This prevents early review from corrupting
 * FSRS memory interval calculations. If no cards are due, a `NothingDueError` is thrown.
 * Users can pass `cram: true` to explicitly preview/practice without schedule corruption.
 *
 * ## Applied Design Patterns
 * - **Use Case Pattern**: Encapsulates review queue selection in a pure domain service.
 * - **Strategy / Interleaving Pattern**: Interleaves queue items across topics.
 */
export class StartReviewInteractor {
  /**
   * @param cards All cards in the active workspace.
   * @param now Current epoch milliseconds.
   * @param interleave When true (default), mix cards across topics/groups.
   * @param cram When true, allows reviewing cards before their due date.
   * @returns The ordered review queue.
   * @throws {NothingDueError} when there are no due cards (and cram is false).
   */
  execute(
    cards: Card[],
    now: number,
    interleave: boolean = true,
    cram: boolean = false,
    cardTypes?: CardTypeDefinition[]
  ): Card[] {

    const schedulableCards = cards.filter(c => Boolean(c.schedule) && isSchedulable(c, cardTypes));

    let queue: Card[];
    if (cram) {
      queue = schedulableCards;
    } else {
      queue = schedulableCards.filter(c => c.schedule!.dueAt <= now);
    }

    if (queue.length === 0) {
      throw new NothingDueError();
    }

    const finalQueue = interleave ? interleaveByTopic(queue) : queue;


    return finalQueue;
  }
}
