import { describe, expect, it, beforeEach } from "bun:test";
import { GradeReviewInteractor } from "../GradeReviewInteractor";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { MemoryReviewLogRepository } from "../../../adapters/repositories/MemoryReviewLogRepository";
import { FsrsScheduler } from "../FsrsScheduler";
import { createCard } from "../../../entities/card";
import { DEFAULT_FSRS_CONFIG } from "../../../entities/workspace";

/**
 * # GradeReviewInteractor Test Specification
 *
 * ## Business Value & Purpose
 * Verifies that when a learner grades a review card, `GradeReviewInteractor` uses the FSRS engine
 * to calculate updated stability/difficulty/intervals, updates `card.schedule`, and appends an
 * immutable `ReviewLog` to the review log repository.
 */
describe("GradeReviewInteractor Unit Tests", () => {
  let cardRepo: MemoryCardRepository;
  let logRepo: MemoryReviewLogRepository;
  let scheduler: FsrsScheduler;
  let interactor: GradeReviewInteractor;

  const now = 1700000000000;

  beforeEach(() => {
    cardRepo = new MemoryCardRepository();
    logRepo = new MemoryReviewLogRepository();
    scheduler = new FsrsScheduler();
    interactor = new GradeReviewInteractor(cardRepo, scheduler, logRepo);
  });

  it("should update card schedule and persist a review log when graded 'good'", async () => {
    const card = createCard({ workspaceId: "ws-fsrs", type: "question", title: "Q", body: "A" });
    card.schedule = scheduler.initialize(now, DEFAULT_FSRS_CONFIG);
    await cardRepo.saveCard(card);

    const updated = await interactor.execute(card, "good", now, DEFAULT_FSRS_CONFIG);

    expect(updated).not.toBeNull();
    expect(updated!.schedule).toBeDefined();
    expect(updated!.schedule?.reps).toBe(1);
    expect(updated!.schedule?.state).toBe("review");

    const savedCard = await cardRepo.getCard(card.id);
    expect(savedCard?.schedule?.reps).toBe(1);

    const logs = await logRepo.getLogsByCard(card.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].grade).toBe("good");
  });

  it("should return null if card has no schedule", async () => {
    const unscheduledCard = createCard({ workspaceId: "ws-fsrs", type: "note", title: "Note", body: "Text" });
    const result = await interactor.execute(unscheduledCard, "good", now, DEFAULT_FSRS_CONFIG);

    expect(result).toBeNull();
  });
});
