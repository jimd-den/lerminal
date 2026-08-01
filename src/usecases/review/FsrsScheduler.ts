import { Card } from "../../entities/card";
import { FsrsConfig, DEFAULT_FSRS_CONFIG } from "../../entities/workspace";
import { ReviewGrade, ReviewLog, ScheduleState, FsrsStateName } from "../../entities/schedule";

/**
 * Preview result for UI review buttons (e.g. `Again <10m`, `Good 3d`, `Easy 15d`).
 */
export interface ReviewPreview {
  dueAt: number;
  intervalDays: number;
  label: string;
}

const DAY_IN_MS = 86400000;
const MINUTE_IN_MS = 60000;

// Standard FSRS-5 default parameters (w0..w18)
const DEFAULT_FSRS_WEIGHTS = [
  0.40, 1.18, 3.12, 15.47, 7.21, 0.53, 1.06, 0.02, 1.63, 0.15, 1.02, 2.11, 0.08, 0.34, 1.34, 0.24, 2.94, 0.45, 0.34
];

/**
 * # FSRS-5 Spaced Repetition Engine Service
 *
 * ## Business Value & Rationale
 * Implements the FSRS-5 algorithm for predicting memory retention and scheduling reviews.
 * FSRS tracks memory stability and difficulty independently. On initial review of a new card,
 * initial stability is assigned based on initial recall grade (S0). On subsequent reviews,
 * stability updates dynamically according to elapsed time and retrievability (R).
 *
 * ## Applied Design Patterns
 * - **Strategy Pattern**: Encapsulates FSRS-5 mathematical formulas behind the `FsrsScheduler` service interface.
 * - **Adapter / Normalizer Pattern**: Converts legacy minimal schedule state into full FSRS-5 state.
 */
export class FsrsScheduler {
  private readonly w = DEFAULT_FSRS_WEIGHTS;

  /**
   * Initializes a fresh FSRS schedule for a newly enrolled card.
   */
  initialize(now: number, config: FsrsConfig = DEFAULT_FSRS_CONFIG): ScheduleState {

    const initialStability = Math.max(0.1, this.w[2]);
    const initialDifficulty = Math.min(10, Math.max(1, this.w[3]));

    const state: ScheduleState = {
      algorithm: "fsrs",
      version: 5,
      state: "new",
      dueAt: now + DAY_IN_MS,
      lastReviewAt: undefined,
      stability: initialStability,
      difficulty: initialDifficulty,
      interval: 1,
      scheduledDays: 1,
      reps: 0,
      lapses: 0,
    };

    return state;
  }

  /**
   * Normalizes any legacy schedule object into a valid FSRS-5 state object.
   */
  normalizeSchedule(schedule?: ScheduleState, now: number = Date.now()): ScheduleState {
    if (!schedule) {
      return this.initialize(now);
    }

    if (schedule.algorithm === "fsrs" && schedule.stability !== undefined && schedule.difficulty !== undefined) {
      return schedule;
    }

    // Graceful migration of legacy schedules
    const interval = Math.max(1, schedule.interval || 1);
    const reps = schedule.reps || 0;
    const lapses = schedule.lapses || 0;
    const stateName: FsrsStateName = reps > 0 ? "review" : "learning";

    return {
      algorithm: "fsrs",
      version: 5,
      state: stateName,
      dueAt: schedule.dueAt || (now + interval * DAY_IN_MS),
      lastReviewAt: schedule.lastReviewAt || (now - interval * DAY_IN_MS),
      stability: interval,
      difficulty: 5.0,
      interval,
      scheduledDays: interval,
      reps,
      lapses,
    };
  }

  /**
   * Calculates preview labels and due timestamps for each grade button ('again', 'hard', 'good', 'easy').
   */
  preview(
    card: Card,
    now: number = Date.now(),
    config: FsrsConfig = DEFAULT_FSRS_CONFIG
  ): Record<ReviewGrade, ReviewPreview> {
    const grades: ReviewGrade[] = ["again", "hard", "good", "easy"];
    const result = {} as Record<ReviewGrade, ReviewPreview>;

    for (const grade of grades) {
      const outcome = this.calculateReviewOutcome(card, grade, now, config);
      const intervalDays = outcome.schedule.scheduledDays || 1;

      let label: string;
      if (grade === "again" || outcome.schedule.state === "relearning") {
        const stepMin = config.relearningStepsMinutes[0] || 10;
        label = `<${stepMin}m`;
      } else if (intervalDays === 1) {
        label = "1d";
      } else {
        label = `${intervalDays}d`;
      }

      result[grade] = {
        dueAt: outcome.schedule.dueAt,
        intervalDays,
        label,
      };
    }

    return result;
  }

  /**
   * Executes a review, returning the updated schedule and an immutable review log entry.
   */
  review(
    card: Card,
    grade: ReviewGrade,
    now: number = Date.now(),
    config: FsrsConfig = DEFAULT_FSRS_CONFIG
  ): { schedule: ScheduleState; log: ReviewLog } {
    const outcome = this.calculateReviewOutcome(card, grade, now, config);


    return outcome;
  }

  private calculateReviewOutcome(
    card: Card,
    grade: ReviewGrade,
    now: number,
    config: FsrsConfig
  ): { schedule: ScheduleState; log: ReviewLog } {
    const current = this.normalizeSchedule(card.schedule, now);
    const prevState = current.state || "new";

    const lastReview = current.lastReviewAt || (now - (current.interval * DAY_IN_MS));
    const elapsedDays = Math.max(0, (now - lastReview) / DAY_IN_MS);

    let nextState: FsrsStateName = "review";
    let nextStability = current.stability || 1.0;
    let nextDifficulty = current.difficulty || 5.0;
    let dueAt = now;
    let scheduledDays = 1;
    let lapses = current.lapses || 0;
    let reps = current.reps;

    const gMap: Record<ReviewGrade, number> = { again: 1, hard: 2, good: 3, easy: 4 };
    const g = gMap[grade];

    if (grade === "again") {
      nextState = "relearning";
      lapses += 1;
      const relearnStepMinutes = config.relearningStepsMinutes[0] || 10;
      dueAt = now + (relearnStepMinutes * MINUTE_IN_MS);
      scheduledDays = 0;

      if (prevState === "new") {
        nextStability = this.w[0];
      } else {
        const R = Math.pow(1 + (elapsedDays / (9 * nextStability)), -1);
        nextStability = Math.max(
          0.1,
          this.w[11] * Math.pow(nextDifficulty, -this.w[12]) * (Math.pow(nextStability + 1, this.w[13]) - 1) * Math.exp(this.w[14] * (1 - R))
        );
      }
    } else {
      nextState = "review";
      reps += 1;

      // Difficulty update: D' = w6 * D + (1 - w6) * D0(g)
      const d0 = this.w[4] - (g - 3) * this.w[5];
      nextDifficulty = Math.min(10, Math.max(1, (this.w[6] * nextDifficulty) + ((1 - this.w[6]) * d0)));

      if (prevState === "new") {
        // Initial stability S0(g) = w[g-1]
        nextStability = this.w[g - 1];
      } else {
        // Retrievability R = (1 + elapsedDays / (9 * stability))^-1
        const R = Math.pow(1 + (elapsedDays / (9 * nextStability)), -1);
        const hardModifier = grade === "hard" ? 0.8 : grade === "easy" ? 1.3 : 1.0;
        const sInc = Math.exp(this.w[8]) * (11 - nextDifficulty) * Math.pow(nextStability, -this.w[9]) * (Math.exp(this.w[10] * (1 - R)) - 1);
        nextStability = Math.max(0.1, nextStability * (1 + sInc * hardModifier));
      }

      // Calculate next interval in days based on desired retention
      const targetR = Math.min(0.98, Math.max(0.70, config.desiredRetention));
      const rawDays = Math.round(nextStability * (Math.pow(targetR, -1) - 1) / (Math.pow(0.9, -1) - 1));
      scheduledDays = Math.min(config.maximumIntervalDays, Math.max(1, rawDays));
      dueAt = now + (scheduledDays * DAY_IN_MS);
    }

    const nextSchedule: ScheduleState = {
      algorithm: "fsrs",
      version: 5,
      state: nextState,
      dueAt,
      lastReviewAt: now,
      stability: Math.round(nextStability * 100) / 100,
      difficulty: Math.round(nextDifficulty * 100) / 100,
      interval: scheduledDays,
      scheduledDays,
      reps,
      lapses,
    };

    const log: ReviewLog = {
      id: Math.random().toString(36).substring(2, 9),
      cardId: card.id,
      workspaceId: card.workspaceId,
      reviewedAt: now,
      grade,
      previousState: prevState,
      nextState,
      scheduledDays,
      elapsedDays: Math.round(elapsedDays * 100) / 100,
    };

    return { schedule: nextSchedule, log };
  }
}
