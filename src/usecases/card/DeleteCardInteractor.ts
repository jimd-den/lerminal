import { Card } from "../../entities/card";
import { CardRepository } from "../../adapters/repositories/CardRepository";
import { directChildren } from "../tree";

/**
 * # Delete Card Interactor
 *
 * ## Business Value & Purpose
 * Removes a card. By default, if the card is a group its direct children are first
 * promoted up to the card's own parent so deleting a container never silently
 * destroys the cards inside it. When `recursive` is set, the entire subtree under a
 * group is deleted — the intuitive "delete this group and everything in it".
 */
export class DeleteCardInteractor {
  constructor(private readonly cardRepo: CardRepository) {}

  async execute(card: Card, recursive: boolean = false): Promise<void> {
    const all = await this.cardRepo.getCardsByWorkspace(card.workspaceId);

    if (recursive) {
      // Delete the whole subtree: the card plus every descendant.
      for (const descendant of this.collectDescendants(all, card.id)) {
        await this.cardRepo.deleteCard(descendant.id);
      }
      await this.cardRepo.deleteCard(card.id);
      return;
    }

    // Non-recursive: promote direct children up to this card's parent, then delete it.
    for (const child of directChildren(all, card.id)) {
      await this.cardRepo.saveCard({ ...child, parentId: card.parentId });
    }
    await this.cardRepo.deleteCard(card.id);
  }

  /** Collects every descendant of `rootId` (children, grandchildren, …). */
  private collectDescendants(all: Card[], rootId: string): Card[] {
    const out: Card[] = [];
    const stack = directChildren(all, rootId);
    while (stack.length > 0) {
      const node = stack.pop()!;
      out.push(node);
      stack.push(...directChildren(all, node.id));
    }
    return out;
  }
}
