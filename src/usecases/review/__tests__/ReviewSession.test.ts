import { describe, expect, it, beforeEach } from "bun:test";
import { ReviewSession, ReviewHost } from "../ReviewSession";
import { StartReviewInteractor } from "../StartReviewInteractor";
import { GradeReviewInteractor } from "../GradeReviewInteractor";
import { FsrsScheduler } from "../FsrsScheduler";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { MemoryReviewLogRepository } from "../../../adapters/repositories/MemoryReviewLogRepository";
import { BUILTIN_CARD_TYPES } from "../../../entities/cardTypeDefinition";
import { DEFAULT_FSRS_CONFIG } from "../../../entities/workspace";
import { createInitialSchedule } from "../../../entities/schedule";
import { Card, createCard } from "../../../entities/card";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

/** A card that is due, so it lands in a normal (non-cram) queue. */
const dueCard = (title: string): Card => ({
  ...createCard({ workspaceId: "w1", type: "question", title, body: `body of ${title}` }),
  schedule: { ...createInitialSchedule(NOW - 10 * DAY), dueAt: NOW - DAY },
});

class RecordingHost implements ReviewHost {
  cardList: Card[] = [];
  changes = 0;
  messages: string[] = [];
  graded: Card[] = [];
  refreshes = 0;

  cards() {
    return this.cardList;
  }
  cardTypes() {
    return [...BUILTIN_CARD_TYPES];
  }
  interleaveReviews() {
    return true;
  }
  schedulerConfig() {
    return DEFAULT_FSRS_CONFIG;
  }
  onChange() {
    this.changes++;
  }
  notify(message: string) {
    this.messages.push(message);
  }
  onCardGraded(card: Card) {
    this.graded.push(card);
    this.cardList = this.cardList.map((c) => (c.id === card.id ? card : c));
  }
  async refreshCards() {
    this.refreshes++;
  }
}

describe("ReviewSession", () => {
  let host: RecordingHost;
  let cardRepo: MemoryCardRepository;
  let session: ReviewSession;

  beforeEach(() => {
    host = new RecordingHost();
    cardRepo = new MemoryCardRepository();
    const scheduler = new FsrsScheduler();
    session = new ReviewSession({
      startReview: new StartReviewInteractor(),
      gradeReview: new GradeReviewInteractor(
        cardRepo,
        scheduler,
        new MemoryReviewLogRepository(),
      ),
      scheduler,
      host,
      now: () => NOW,
    });
  });

  const seed = async (count: number) => {
    const cards = Array.from({ length: count }, (_, i) => dueCard(`Card ${i + 1}`));
    await cardRepo.saveCards(cards);
    host.cardList = cards;
    return cards;
  };

  it("starts closed", () => {
    expect(session.state).toMatchObject({ isOpen: false, queue: [], index: 0 });
    expect(session.currentCard).toBeUndefined();
  });

  it("opens a session over the due cards, answer hidden", async () => {
    await seed(3);
    session.start();

    expect(session.state.isOpen).toBe(true);
    expect(session.state.queue).toHaveLength(3);
    expect(session.state.index).toBe(0);
    expect(session.state.revealAnswer).toBe(false);
  });

  it("explains why a session could not start, and stays closed", () => {
    host.cardList = []; // nothing to study
    session.start();

    expect(session.state.isOpen).toBe(false);
    expect(host.messages).toHaveLength(1);
  });

  it("reveals the answer on request", async () => {
    await seed(1);
    session.start();
    session.reveal();
    expect(session.state.revealAnswer).toBe(true);
  });

  it("hides the answer again on every advance", async () => {
    await seed(3);
    session.start();

    session.reveal();
    expect(await session.grade("good")).toBe(true);
    expect(session.state.revealAnswer).toBe(false);
    expect(session.state.index).toBe(1);

    session.reveal();
    await session.grade("good");
    expect(session.state.revealAnswer).toBe(false);
  });

  it("persists each grade as it happens and tells the app", async () => {
    const [card] = await seed(2);
    session.start();
    await session.grade("good");

    expect(host.graded).toHaveLength(1);
    const stored = await cardRepo.getCard(card.id);
    expect(stored?.schedule?.dueAt).toBeGreaterThan(NOW);
  });

  it("shows the graded card's new schedule in the queue rather than the stale copy", async () => {
    await seed(2);
    session.start();
    const before = session.state.queue[0].schedule?.dueAt;
    await session.grade("good");

    // The graded card is still in the queue behind the cursor; it must reflect the grade.
    expect(session.state.queue[0].schedule?.dueAt).not.toBe(before);
  });

  it("closes itself after the last card and reloads", async () => {
    await seed(2);
    session.start();

    expect(await session.grade("good")).toBe(true);
    expect(await session.grade("good")).toBe(false);

    expect(session.state).toMatchObject({ isOpen: false, queue: [], index: 0 });
    expect(host.refreshes).toBe(1);
    expect(host.messages).toContain("Review complete!");
  });

  it("grades nothing when no session is running", async () => {
    expect(await session.grade("good")).toBe(false);
    expect(host.graded).toEqual([]);
  });

  it("keeps grades already given when the session is abandoned", async () => {
    await seed(3);
    session.start();
    await session.grade("good");
    session.close();

    expect(session.state.isOpen).toBe(false);
    expect(host.graded).toHaveLength(1);
  });

  it("shows an edit made to a card mid-session", async () => {
    const [card] = await seed(2);
    session.start();
    session.applyCardUpdate({ ...card, title: "Edited" });

    expect(session.state.queue[0].title).toBe("Edited");
  });

  it("ignores an edit to a card that isn't in the queue", async () => {
    await seed(1);
    session.start();
    const before = session.state.queue;
    session.applyCardUpdate(dueCard("Unrelated"));

    expect(session.state.queue).toBe(before);
  });

  it("previews all four grades for a card, and nothing for an unknown one", async () => {
    const [card] = await seed(1);
    const previews = session.previews(card.id);

    expect(previews).not.toBeNull();
    expect(Object.keys(previews!).sort()).toEqual(["again", "easy", "good", "hard"]);
    expect(session.previews("nope")).toBeNull();
  });
});
