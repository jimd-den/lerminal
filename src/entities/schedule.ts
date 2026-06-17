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

export interface ScheduleState {
  /** The millisecond timestamp when the card is next due for review. */
  dueAt: number;
  /** The number of days until the card is reviewed again after passing. */
  interval: number;
  /** The total number of successful recall attempts (reps) on this card. */
  reps: number;
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
    dueAt: now + 86400000, // 24 hours in milliseconds
    interval: 1,
    reps: 0,
  };
  
  console.log(`[${logTimestamp}] [createInitialSchedule] INPUTS: now=${now} | OUTPUT: ${JSON.stringify(result)}`);
  return result;
}

/**
 * Updates the schedule of a card after a review attempt.
 * 
 * @param current The current schedule state of the card.
 * @param ok True if the user remembered the card, false if they forgot.
 * @param now The current epoch time in milliseconds.
 * @returns The updated schedule state.
 */
export function updateSchedule(current: ScheduleState, ok: boolean, now: number): ScheduleState {
  const logTimestamp = new Date().toISOString();
  let result: ScheduleState;

  if (ok) {
    const nextInterval = Math.round(current.interval * 2.4) + 1;
    result = {
      dueAt: now + nextInterval * 86400000,
      interval: nextInterval,
      reps: current.reps + 1,
    };
  } else {
    result = {
      dueAt: now + 600000, // 10 minutes in milliseconds for immediate re-learning
      interval: 1,
      reps: current.reps, // Keep the successful count unchanged
    };
  }

  console.log(`[${logTimestamp}] [updateSchedule] INPUTS: current=${JSON.stringify(current)}, ok=${ok}, now=${now} | OUTPUT: ${JSON.stringify(result)}`);
  return result;
}
