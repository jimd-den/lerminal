import { describe, expect, it } from "bun:test";
import { createInitialSchedule, updateSchedule } from "../schedule";

describe("Spaced Repetition Scheduler (FSRS-lite)", () => {
  const mockNow = 1718582400000; // A fixed timestamp in ms (e.g. June 17, 2024)
  const DAY_IN_MS = 86400000;

  it("should create an initial schedule set to 1 day in the future", () => {
    const schedule = createInitialSchedule(mockNow);
    expect(schedule.interval).toBe(1);
    expect(schedule.reps).toBe(0);
    expect(schedule.dueAt).toBe(mockNow + DAY_IN_MS);
  });

  it("should increase interval and reps on successful review (ok: true)", () => {
    const initial = createInitialSchedule(mockNow);
    const step1 = updateSchedule(initial, true, mockNow);

    // Math.round(1 * 2.4) + 1 = 2 + 1 = 3
    expect(step1.interval).toBe(3);
    expect(step1.reps).toBe(1);
    expect(step1.dueAt).toBe(mockNow + 3 * DAY_IN_MS);

    const step2 = updateSchedule(step1, true, mockNow);
    // Math.round(3 * 2.4) + 1 = Math.round(7.2) + 1 = 7 + 1 = 8
    expect(step2.interval).toBe(8);
    expect(step2.reps).toBe(2);
    expect(step2.dueAt).toBe(mockNow + 8 * DAY_IN_MS);
  });

  it("should reset interval to 1 and set due to 10 minutes on failed review (ok: false)", () => {
    const initial = { interval: 8, reps: 2, dueAt: mockNow };
    const failed = updateSchedule(initial, false, mockNow);

    expect(failed.interval).toBe(1);
    expect(failed.reps).toBe(2); // Reps don't increment on failure
    expect(failed.dueAt).toBe(mockNow + 600000); // 10 minutes in ms
  });
});
