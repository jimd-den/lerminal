import { Card } from "../../entities/card";
import { CardLink, createCardLink, isDuplicateCardLink } from "../../entities/cardLink";
import { CardLinkRepository } from "../ports/repositories/CardLinkRepository";
import { UseCaseError } from "../errors";

/** Raised when either endpoint card id doesn't exist in the given workspace. */
export class CardNotFoundError extends UseCaseError {
  constructor() {
    super("Couldn't find those cards. Nothing was changed.");
  }
}

/** Raised when the exact same link (same from/to/relation) already exists. */
export class DuplicateCardLinkError extends UseCaseError {
  constructor() {
    super("Those cards are already linked that way.");
  }
}

export interface LinkCardsRequest {
  workspaceId: string;
  fromCardId: string;
  toCardId: string;
  relation?: string;
  /** The workspace's current cards, used to validate both endpoints exist. */
  cards: Card[];
}

/**
 * # Link Cards Interactor
 *
 * ## Business Value & Purpose
 * The single primitive for creating a `CardLink`: validates both endpoints exist in the
 * given workspace, rejects an exact duplicate (same from/to/relation), and persists via
 * `CardLinkRepository`. Deliberately narrow — no graph traversal, no cascading logic, no
 * cycle detection. Mirrors `GroupCardsInteractor`'s shape as the model for a single-
 * purpose card-relationship interactor.
 */
export class LinkCardsInteractor {
  constructor(private readonly cardLinkRepo: CardLinkRepository) {}

  /**
   * @returns The newly created link.
   * @throws {CardNotFoundError} when either endpoint isn't a card in this workspace.
   * @throws {DuplicateCardLinkError} when the exact same link already exists.
   */
  async execute(request: LinkCardsRequest): Promise<CardLink> {
    const fromCard = request.cards.find(
      (c) => c.id === request.fromCardId && c.workspaceId === request.workspaceId,
    );
    const toCard = request.cards.find(
      (c) => c.id === request.toCardId && c.workspaceId === request.workspaceId,
    );
    if (!fromCard || !toCard) {
      throw new CardNotFoundError();
    }

    const candidate = createCardLink({
      workspaceId: request.workspaceId,
      fromCardId: request.fromCardId,
      toCardId: request.toCardId,
      relation: request.relation,
    });

    const existing = await this.cardLinkRepo.getLinksByWorkspace(request.workspaceId);
    if (existing.some((link) => isDuplicateCardLink(link, candidate))) {
      throw new DuplicateCardLinkError();
    }

    await this.cardLinkRepo.saveLink(candidate);
    return candidate;
  }
}
