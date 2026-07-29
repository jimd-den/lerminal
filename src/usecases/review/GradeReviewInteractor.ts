import { Card } from "../../entities/card";
import { gradeSchedule, ReviewGrade, ReviewLog } from "../../entities/schedule";
import { CardRepository } from "../../adapters/repositories/CardRepository";
import { ReviewLogRepository } from "../../adapters/repositories/ReviewLogRepository";
import { FsrsScheduler } from "./FsrsScheduler";
import { FsrsConfig, DEFAULT_FSRS_CONFIG } from "../../entities/workspace";

/** Maps legacy pass/fail boolean onto the four-level grade scale. */
function toGrade(grade: boolean | ReviewGrade): ReviewGrade {
  if (grade === true) return "good";
  if (grade === false) return "again";
  return grade;
}

/**
 * # Grade Review Interactor (FSRS-5 Integrated)
 *
 * ## Business Value & Purpose
 * Applies a recall grade to a card during a review session. Delegates scheduling mathematics
 * to the `FsrsScheduler` service and appends an immutable `ReviewLog` entry to track memory retention.
 *
 * ## Applied Design Patterns
 * - **Use Case Pattern**: Encapsulates review grading business logic in an application interactor.
 * - **Strategy Pattern**: Uses `FsrsScheduler` for FSRS-5 calculations.
 */
export class GradeReviewInteractor {
  constructor(
    private readonly cardRepo: CardRepository,
    private readonly scheduler?: FsrsScheduler,
    private readonly logRepo?: ReviewLogRepository
  ) {}

  /**
   * @param card The card being graded; must already have a schedule.
   * @param grade Recall grade (`again`/`hard`/`good`/`easy`, or boolean pass/fail).
   * @param now Current epoch milliseconds.
   * @param config Optional space-level FSRS configuration.
   * @returns The updated card, or null if the card had no schedule to grade.
   */
  async execute(
    card: Card,
    grade: boolean | ReviewGrade,
    now: number = Date.now(),
    config: FsrsConfig = DEFAULT_FSRS_CONFIG
  ): Promise<Card | null> {
    const logTimestamp = new Date().toISOString();

    if (!card.schedule) {
      return null;
    }

    const reviewGrade = toGrade(grade);
    let updatedSchedule = card.schedule;
    let reviewLog: ReviewLog | undefined;

    if (this.scheduler) {
      const outcome = this.scheduler.review(card, reviewGrade, now, config);
      updatedSchedule = outcome.schedule;
      reviewLog = outcome.log;
    } else {
      updatedSchedule = gradeSchedule(card.schedule, reviewGrade, now);
    }

    const updatedCard: Card = {
      ...card,
      schedule: updatedSchedule,
    };

    await this.cardRepo.saveCard(updatedCard);

    if (reviewLog && this.logRepo) {
      await this.logRepo.saveLog(reviewLog);
    }

    console.log(
      `[${logTimestamp}] [GradeReviewInteractor.execute] Graded card ${card.id} with '${reviewGrade}'`
    );

    return updatedCard;
  }
}
