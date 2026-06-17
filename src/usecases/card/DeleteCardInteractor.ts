import { Card } from "../../entities/card";
import { CardRepository } from "../../adapters/repositories/CardRepository";
import { directChildren } from "../tree";

/**
 * # Delete Card Interactor
 *
 * ## Business Value & Purpose
 * Removes a single card. If the card is a group, its direct children are first
 * promoted up to the card's own parent so deleting a container never silently
 * destroys (or orphans) the cards inside it.
 */
export class DeleteCardInteractor {
  constructor(private readonly cardRepo: CardRepository) {}

  async execute(card: Card): Promise<void> {
    const siblingsAndChildren = await this.cardRepo.getCardsByWorkspace(card.workspaceId);
    for (const child of directChildren(siblingsAndChildren, card.id)) {
      await this.cardRepo.saveCard({ ...child, parentId: card.parentId });
    }
    await this.cardRepo.deleteCard(card.id);
  }
}
