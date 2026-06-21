/**
 * # Spaced Repetition Scheduling Engine (FSRS-lite)
 * 
 * ## Business Value & Purpose
 * Memory decays over time. Research shows that spacing reviews over expanding intervals
 * (the spacing effect) is the most efficient way to transfer information into long-term memory.
 * This engine tracks how well a user knows a concept and schedules its next review.
 * 
 * ## Rules of Scheduling (FSRS-lite)
 * 1. **Initial Review**: Newly scheduled cards are set to be due exactly 1 day (24 hours) from now.
 * 2. **Successful Recall (Pass)**: The system assumes the user's memory stability has increased.
 *    The next interval is scaled by a factor of 2.4 (interval = Math.round(interval * 2.4) + 1).
 *    This expands the time between reviews, saving the user's attention.
 * 3. **Forgotten Recall (Fail)**: The system resets the card's interval back to 1 day and makes
 *    it due in 10 minutes for immediate re-study.
 */

/**
 * A four-level recall grade (Anki/FSRS-style), richer than pass/fail so the scheduler
 * can react to *how well* a card was recalled, not just whether it was.
 * - `again`: forgotten — relearn in minutes, count a lapse.
 * - `hard`: recalled with difficulty — grow the interval only slightly.
 * - `good`: recalled correctly — the standard expansion.
 * - `easy`: recalled effortlessly — grow the interval aggressively.
 */
export type ReviewGrade = "again" | "hard" | "good" | "easy";

const DAY_IN_MS = 86400000;
const TEN_MIN_MS = 600000;

export interface ScheduleState {
  /** The millisecond timestamp when the card is next due for review. */
  dueAt: number;
  /** The number of days until the card is reviewed again after passing. */
  interval: number;
  /** The total number of successful recall attempts (reps) on this card. */
  reps: number;
  /** The number of times the card has been forgotten (graded `again`). */
  lapses?: number;
}

/**
 * Creates the initial schedule for a card that is added to the study queue.
 *
 * @param now The current epoch time in milliseconds.
 * @returns The initial schedule due in 24 hours.
 */
export function createInitialSchedule(now: number): ScheduleState {
  const logTimestamp = new Date().toISOString();
  const result: ScheduleState = {
    dueAt: now + DAY_IN_MS, // 24 hours in milliseconds
    interval: 1,
    reps: 0,
    lapses: 0,
  };

  console.log(`[${logTimestamp}] [createInitialSchedule] INPUTS: now=${now} | OUTPUT: ${JSON.stringify(result)}`);
  return result;
}

/**
 * Advances a card's schedule from a four-level recall grade. `good` reproduces the
 * legacy pass behavior (×2.4 + 1) and `again` the legacy fail behavior (reset, due in
 * 10 minutes) so existing data and callers stay consistent.
 *
 * @param current The current schedule state of the card.
 * @param grade How well the user recalled the card.
 * @param now The current epoch time in milliseconds.
 * @returns The updated schedule state.
 */
export function gradeSchedule(current: ScheduleState, grade: ReviewGrade, now: number): ScheduleState {
  const logTimestamp = new Date().toISOString();
  const lapses = current.lapses ?? 0;
  let result: ScheduleState;

  if (grade === "again") {
    result = {
      dueAt: now + TEN_MIN_MS,
      interval: 1,
      reps: current.reps, // Reps don't increment on a lapse
      lapses: lapses + 1,
    };
  } else {
    const factor = grade === "hard" ? 1.2 : grade === "easy" ? 3.2 : 2.4;
    const bonus = grade === "easy" ? 2 : 1;
    const nextInterval = Math.max(1, Math.round(current.interval * factor) + bonus);
    result = {
      dueAt: now + nextInterval * DAY_IN_MS,
      interval: nextInterval,
      reps: current.reps + 1,
      lapses,
    };
  }

  console.log(`[${logTimestamp}] [gradeSchedule] INPUTS: current=${JSON.stringify(current)}, grade=${grade}, now=${now} | OUTPUT: ${JSON.stringify(result)}`);
  return result;
}

/**
 * Backward-compatible pass/fail wrapper over {@link gradeSchedule}: `true` maps to
 * `good`, `false` to `again`.
 *
 * @param current The current schedule state of the card.
 * @param ok True if the user remembered the card, false if they forgot.
 * @param now The current epoch time in milliseconds.
 * @returns The updated schedule state.
 */
export function updateSchedule(current: ScheduleState, ok: boolean, now: number): ScheduleState {
  return gradeSchedule(current, ok ? "good" : "again", now);
}
