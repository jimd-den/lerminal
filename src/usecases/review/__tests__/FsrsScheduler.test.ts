import { describe, expect, it, beforeEach } from "bun:test";
import { FsrsScheduler } from "../FsrsScheduler";
import { createCard } from "../../../entities/card";
import { DEFAULT_FSRS_CONFIG } from "../../../entities/workspace";
import { ScheduleState } from "../../../entities/schedule";

/**
 * # FSRS-5 Scheduler Test Specification
 *
 * ## Business Value & Rationale
 * FSRS-5 provides mathematically sound memory modeling based on retrievability, stability,
 * and difficulty. This test suite verifies:
 * 1. Initial schedule generation for new cards.
 * 2. Proper FSRS state updates for recall grades ('again', 'hard', 'good', 'easy').
 * 3. Backward-compatible migration of legacy schedules.
 * 4. Honest interval preview labels ('<10m', '3d', '9d', '18d') for review UI buttons.
 * 5. Generation of immutable review log entries for auditability and memory analytics.
 */
describe("FsrsScheduler Engine", () => {
  let scheduler: FsrsScheduler;
  const now = 1700000000000; // Base reference timestamp

  beforeEach(() => {
    scheduler = new FsrsScheduler();
  });

  it("should initialize a new schedule with default FSRS state", () => {
    const schedule = scheduler.initialize(now, DEFAULT_FSRS_CONFIG);

    expect(schedule.algorithm).toBe("fsrs");
    expect(schedule.version).toBe(5);
    expect(schedule.state).toBe("new");
    expect(schedule.stability).toBeGreaterThan(0);
    expect(schedule.difficulty).toBeGreaterThan(0);
    expect(schedule.reps).toBe(0);
    expect(schedule.lapses).toBe(0);
    expect(schedule.dueAt).toBeGreaterThan(now);
  });

  it("should generate truthful interval previews for all 4 review grades", () => {
    const card = createCard({
      workspaceId: "w1",
      type: "question",
      title: "What is FSRS?",
      body: "Free Spaced Repetition Scheduler",
    });
    card.schedule = scheduler.initialize(now, DEFAULT_FSRS_CONFIG);

    const previews = scheduler.preview(card, now, DEFAULT_FSRS_CONFIG);

    expect(previews.again).toBeDefined();
    expect(previews.hard).toBeDefined();
    expect(previews.good).toBeDefined();
    expect(previews.easy).toBeDefined();

    expect(previews.again.label).toMatch(/<10m|10m|1m/);
    expect(previews.good.intervalDays).toBeGreaterThanOrEqual(1);
    expect(previews.easy.intervalDays).toBeGreaterThan(previews.good.intervalDays);
  });

  it("should process a 'good' review, advancing state and returning a ReviewLog", () => {
    const card = createCard({
      workspaceId: "ws-fsrs",
      type: "question",
      title: "Q",
      body: "A",
    });
    card.schedule = scheduler.initialize(now, DEFAULT_FSRS_CONFIG);

    const result = scheduler.review(card, "good", now, DEFAULT_FSRS_CONFIG);

    expect(result.schedule).toBeDefined();
    expect(result.schedule.reps).toBe(1);
    expect(result.schedule.lastReviewAt).toBe(now);
    expect(result.schedule.stability).toBeGreaterThan(0);

    expect(result.log).toBeDefined();
    expect(result.log.cardId).toBe(card.id);
    expect(result.log.workspaceId).toBe("ws-fsrs");
    expect(result.log.grade).toBe("good");
  });

  it("should handle a lapse on 'again' by incrementing lapses and resetting to relearning", () => {
    const card = createCard({
      workspaceId: "ws-fsrs",
      type: "question",
      title: "Q",
      body: "A",
    });
    card.schedule = {
      algorithm: "fsrs",
      version: 5,
      state: "review",
      dueAt: now - 1000,
      stability: 10,
      difficulty: 5,
      interval: 10,
      scheduledDays: 10,
      reps: 5,
      lapses: 0,
    };

    const result = scheduler.review(card, "again", now, DEFAULT_FSRS_CONFIG);

    expect(result.schedule.lapses).toBe(1);
    expect(result.schedule.state).toBe("relearning");
    expect(result.schedule.dueAt).toBe(now + 10 * 60 * 1000); // 10 minutes
  });

  it("should migrate legacy schedule state gracefully", () => {
    const legacySchedule: ScheduleState = {
      dueAt: now,
      interval: 4,
      reps: 2,
      lapses: 1,
    };

    const migrated = scheduler.normalizeSchedule(legacySchedule, now);

    expect(migrated.algorithm).toBe("fsrs");
    expect(migrated.version).toBe(5);
    expect(migrated.stability).toBe(4);
    expect(migrated.difficulty).toBe(5);
    expect(migrated.reps).toBe(2);
    expect(migrated.lapses).toBe(1);
  });
});
