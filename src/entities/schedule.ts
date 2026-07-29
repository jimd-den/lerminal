/**
 * # FSRS-5 Spaced Repetition Scheduling State & Review Log Model
 *
 * ## Business Value & Purpose
 * Memory decays over time following memory retention curves. ChunkBuddy implements the FSRS-5
 * (Free Spaced Repetition Scheduler) algorithm to estimate memory stability (S) and difficulty (D)
 * for each card. FSRS adapts review intervals to actual user performance and desired retention.
 *
 * ## Applied Design Patterns
 * - **State Pattern**: Tracks card memory lifecycle across states (`new`, `learning`, `review`, `relearning`).
 * - **Immutable Audit Log Pattern**: Persists immutable `ReviewLog` entries for memory telemetry and history.
 */

export type ReviewGrade = "again" | "hard" | "good" | "easy";

export type FsrsStateName = "new" | "learning" | "review" | "relearning";

const DAY_IN_MS = 86400000;
const TEN_MIN_MS = 600000;

export interface ScheduleState {
  algorithm?: "fsrs";
  version?: 5;
  state?: FsrsStateName;
  /** Millisecond epoch timestamp when the card is next due for review. */
  dueAt: number;
  /** Millisecond epoch timestamp when the card was last reviewed. */
  lastReviewAt?: number;
  /** Memory stability (S) in days: the time required for retention to decay to 90%. */
  stability?: number;
  /** Card difficulty (D) on a 1..10 scale. */
  difficulty?: number;
  /** Scheduled days for the current review interval. */
  scheduledDays?: number;
  /** Number of days until the card is reviewed again (legacy interval representation). */
  interval: number;
  /** Total number of successful recall attempts (reps) on this card. */
  reps: number;
  /** Number of times the card has been forgotten (graded `again`). */
  lapses?: number;
}

export interface ReviewLog {
  id: string;
  cardId: string;
  workspaceId: string;
  reviewedAt: number;
  grade: ReviewGrade;
  previousState: FsrsStateName;
  nextState: FsrsStateName;
  scheduledDays: number;
  elapsedDays: number;
}

/**
 * Creates initial schedule state for a newly enrolled card.
 */
export function createInitialSchedule(now: number): ScheduleState {
  const logTimestamp = new Date().toISOString();
  const result: ScheduleState = {
    algorithm: "fsrs",
    version: 5,
    state: "new",
    dueAt: now + DAY_IN_MS,
    stability: 1.0,
    difficulty: 5.0,
    interval: 1,
    scheduledDays: 1,
    reps: 0,
    lapses: 0,
  };

  console.log(`[${logTimestamp}] [createInitialSchedule] INPUTS: now=${now} | OUTPUT: ${JSON.stringify(result)}`);
  return result;
}

/**
 * Legacy grade schedule fallback helper for backward compatibility.
 */
export function gradeSchedule(current: ScheduleState, grade: ReviewGrade, now: number): ScheduleState {
  const logTimestamp = new Date().toISOString();
  const lapses = current.lapses ?? 0;
  let result: ScheduleState;

  if (grade === "again") {
    result = {
      ...current,
      dueAt: now + TEN_MIN_MS,
      interval: 1,
      scheduledDays: 0,
      reps: current.reps,
      lapses: lapses + 1,
      state: "relearning",
      lastReviewAt: now,
    };
  } else {
    const factor = grade === "hard" ? 1.2 : grade === "easy" ? 3.2 : 2.4;
    const bonus = grade === "easy" ? 2 : 1;
    const nextInterval = Math.max(1, Math.round(current.interval * factor) + bonus);
    result = {
      ...current,
      dueAt: now + nextInterval * DAY_IN_MS,
      interval: nextInterval,
      scheduledDays: nextInterval,
      reps: current.reps + 1,
      lapses,
      state: "review",
      lastReviewAt: now,
    };
  }

  console.log(`[${logTimestamp}] [gradeSchedule] INPUTS: current=${JSON.stringify(current)}, grade=${grade}, now=${now} | OUTPUT: ${JSON.stringify(result)}`);
  return result;
}

export function updateSchedule(current: ScheduleState, ok: boolean, now: number): ScheduleState {
  return gradeSchedule(current, ok ? "good" : "again", now);
}
