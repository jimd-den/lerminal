import { Card } from "../../entities/card";
import { CardRepository } from "../../usecases/ports/repositories/CardRepository";

/**
 * # Memory Card Repository
 * 
 * ## Business Value & Purpose
 * An in-memory implementation of the CardRepository contract. Useful for unit testing
 * use cases and UI components in isolation, and serving as a zero-latency fallback state.
 */
export class MemoryCardRepository implements CardRepository {
  private cards: Map<string, Card> = new Map();

  async getCardsByWorkspace(workspaceId: string): Promise<Card[]> {
    const result = Array.from(this.cards.values()).filter(c => c.workspaceId === workspaceId);
    return result;
  }

  async saveCard(card: Card): Promise<void> {
    this.cards.set(card.id, card);
  }

  async saveCards(cards: Card[]): Promise<void> {
    for (const card of cards) {
      this.cards.set(card.id, card);
    }
  }

  async deleteCard(cardId: string): Promise<void> {
    this.cards.delete(cardId);
  }

  async getCard(cardId: string): Promise<Card | null> {
    const result = this.cards.get(cardId) || null;
    return result;
  }
}
