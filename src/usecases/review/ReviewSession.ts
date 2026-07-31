import { Card } from "../../entities/card";
import { CardTypeDefinition } from "../../entities/cardTypeDefinition";
import { FsrsConfig } from "../../entities/workspace";
import { ReviewGrade } from "../../entities/schedule";
import { UseCaseError } from "../errors";
import { StartReviewInteractor } from "./StartReviewInteractor";
import { GradeReviewInteractor } from "./GradeReviewInteractor";
import { FsrsScheduler, ReviewPreview } from "./FsrsScheduler";

/**
 * # Review Session
 *
 * ## Business Value & Purpose
 * A study session from "start reviewing" to the last card graded. It is the one part of
 * the app where the user's *time* is the scarce resource, so the session state — which
 * card, whether the answer is showing, how many are left — has to stay exactly in step
 * with what's on screen.
 *
 * Holding it here rather than spread across domain and UI state makes the session's one
 * real invariant enforceable in a single place: the answer is hidden again on every
 * advance. A revealed answer carried into the next card silently destroys that card's
 * value as a retrieval attempt, and it is the kind of bug that no test catches when the
 * flags live three fields apart in two different objects.
 */

export interface ReviewSessionState {
  /** The cards to study, in the order they'll be shown. */
  queue: Card[];
  index: number;
  isOpen: boolean;
  revealAnswer: boolean;
}

export interface ReviewHost {
  cards(): Card[];
  cardTypes(): CardTypeDefinition[];
  /** Whether new material should be mixed in with due reviews. */
  interleaveReviews(): boolean;
  /** The active workspace's scheduling parameters. */
  schedulerConfig(): FsrsConfig;
  onChange(): void;
  notify(message: string): void;
  /** A card was rescheduled; update the app's copy without a round trip to storage. */
  onCardGraded(card: Card): void;
  refreshCards(): Promise<void>;
}

export interface ReviewSessionDeps {
  startReview: StartReviewInteractor;
  gradeReview: GradeReviewInteractor;
  scheduler: FsrsScheduler;
  host: ReviewHost;
  /** Injectable for deterministic tests. */
  now?: () => number;
}

const CLOSED: ReviewSessionState = {
  queue: [],
  index: 0,
  isOpen: false,
  revealAnswer: false,
};

export class ReviewSession {
  private current: ReviewSessionState = { ...CLOSED };
  private readonly now: () => number;

  constructor(private readonly deps: ReviewSessionDeps) {
    this.now = deps.now ?? Date.now;
  }

  get state(): ReviewSessionState {
    return this.current;
  }

  private patch(changes: Partial<ReviewSessionState>): void {
    this.current = { ...this.current, ...changes };
    this.deps.host.onChange();
  }

  /** The card the user is looking at, if a session is running. */
  get currentCard(): Card | undefined {
    return this.current.queue[this.current.index];
  }

  /** FSRS interval previews for all four grade buttons. */
  previews(cardId: string): Record<ReviewGrade, ReviewPreview> | null {
    const card = this.deps.host.cards().find((c) => c.id === cardId);
    if (!card) return null;
    return this.deps.scheduler.preview(card, this.now(), this.deps.host.schedulerConfig());
  }

  /**
   * Builds the queue and opens the session. `cram` ignores due dates — an explicit
   * "study anyway" that must not be confused with real scheduling.
   */
  start(cram: boolean = false): void {
    try {
      const queue = this.deps.startReview.execute(
        this.deps.host.cards(),
        this.now(),
        this.deps.host.interleaveReviews(),
        cram,
        this.deps.host.cardTypes(),
      );
      this.patch({ queue, index: 0, isOpen: true, revealAnswer: false });
    } catch (error) {
      // "Nothing is due" arrives here as a UseCaseError: it's an answer, not a fault.
      this.patch({ ...CLOSED });
      this.deps.host.notify(
        error instanceof UseCaseError ? error.userMessage : "Could not start review",
      );
    }
  }

  reveal(): void {
    this.patch({ revealAnswer: true });
  }

  /**
   * Grades the current card and moves on, ending the session after the last one.
   * Returns whether the session is still running.
   */
  async grade(grade: boolean | ReviewGrade): Promise<boolean> {
    const card = this.currentCard;
    if (!card) return false;

    const updated = await this.deps.gradeReview.execute(
      card,
      grade,
      this.now(),
      this.deps.host.schedulerConfig(),
    );
    if (!updated) return this.current.isOpen;

    this.deps.host.onCardGraded(updated);
    const queue = this.current.queue.map((queued) =>
      queued.id === updated.id ? updated : queued,
    );

    const nextIndex = this.current.index + 1;
    if (nextIndex >= queue.length) {
      this.patch({ ...CLOSED });
      await this.deps.host.refreshCards();
      this.deps.host.notify("Review complete!");
      return false;
    }

    // The answer is hidden again on every advance — see the class note.
    this.patch({ queue, index: nextIndex, revealAnswer: false });
    return true;
  }

  /**
   * Reflects an edit made to a card while it is sitting in the queue — editing a card
   * mid-session must show the edit, not the copy captured when the queue was built.
   */
  applyCardUpdate(card: Card): void {
    if (!this.current.queue.some((queued) => queued.id === card.id)) return;
    this.patch({
      queue: this.current.queue.map((queued) =>
        queued.id === card.id ? card : queued,
      ),
    });
  }

  /** Abandons the session. Grades already given are kept; they were saved as they happened. */
  close(): void {
    this.patch({ ...CLOSED });
  }
}
