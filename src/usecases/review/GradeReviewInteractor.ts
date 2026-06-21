import { Card } from "../../entities/card";
import { gradeSchedule, ReviewGrade } from "../../entities/schedule";
import { CardRepository } from "../../adapters/repositories/CardRepository";

/** Maps the legacy pass/fail boolean onto the four-level grade scale. */
function toGrade(grade: boolean | ReviewGrade): ReviewGrade {
  if (grade === true) return "good";
  if (grade === false) return "again";
  return grade;
}

/**
 * # Grade Review Interactor
 *
 * ## Business Value & Purpose
 * Applies a recall grade to a card: it advances the card's spaced-repetition
 * schedule (expanding the interval more or less depending on how well it was
 * recalled, resetting on a lapse) and persists the result. Accepts either the
 * four-level {@link ReviewGrade} or a legacy pass/fail boolean.
 */
export class GradeReviewInteractor {
  constructor(private readonly cardRepo: CardRepository) {}

  /**
   * @param card The card being graded; must already have a schedule.
   * @param grade How well the user recalled it (`again`/`hard`/`good`/`easy`, or a
   *   boolean for pass/fail).
   * @param now Current epoch milliseconds.
   * @returns The updated card, or null if the card had no schedule to grade.
   */
  async execute(card: Card, grade: boolean | ReviewGrade, now: number): Promise<Card | null> {
    if (!card.schedule) {
      return null;
    }

    const updated: Card = {
      ...card,
      schedule: gradeSchedule(card.schedule, toGrade(grade), now),
    };

    await this.cardRepo.saveCard(updated);
    return updated;
  }
}
