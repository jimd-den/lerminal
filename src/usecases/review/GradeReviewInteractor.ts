import { Card } from "../../entities/card";
import { updateSchedule } from "../../entities/schedule";
import { CardRepository } from "../../adapters/repositories/CardRepository";

/**
 * # Grade Review Interactor
 *
 * ## Business Value & Purpose
 * Applies a recall grade to a card: it advances the card's spaced-repetition
 * schedule (expanding the interval on success, resetting on failure) and persists
 * the result.
 */
export class GradeReviewInteractor {
  constructor(private readonly cardRepo: CardRepository) {}

  /**
   * @param card The card being graded; must already have a schedule.
   * @param ok Whether the user recalled it successfully.
   * @param now Current epoch milliseconds.
   * @returns The updated card, or null if the card had no schedule to grade.
   */
  async execute(card: Card, ok: boolean, now: number): Promise<Card | null> {
    if (!card.schedule) {
      return null;
    }

    const updated: Card = {
      ...card,
      schedule: updateSchedule(card.schedule, ok, now),
    };

    await this.cardRepo.saveCard(updated);
    return updated;
  }
}
