import { Card } from "../../entities/card";
import { CardRepository } from "./CardRepository";

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
    const logTimestamp = new Date().toISOString();
    const result = Array.from(this.cards.values()).filter(c => c.workspaceId === workspaceId);
    console.log(`[${logTimestamp}] [MemoryCardRepository.getCardsByWorkspace] workspaceId=${workspaceId} -> returned ${result.length} cards`);
    return result;
  }

  async saveCard(card: Card): Promise<void> {
    const logTimestamp = new Date().toISOString();
    this.cards.set(card.id, card);
    console.log(`[${logTimestamp}] [MemoryCardRepository.saveCard] cardId=${card.id}`);
  }

  async saveCards(cards: Card[]): Promise<void> {
    const logTimestamp = new Date().toISOString();
    for (const card of cards) {
      this.cards.set(card.id, card);
    }
    console.log(`[${logTimestamp}] [MemoryCardRepository.saveCards] count=${cards.length}`);
  }

  async deleteCard(cardId: string): Promise<void> {
    const logTimestamp = new Date().toISOString();
    this.cards.delete(cardId);
    console.log(`[${logTimestamp}] [MemoryCardRepository.deleteCard] cardId=${cardId}`);
  }

  async getCard(cardId: string): Promise<Card | null> {
    const logTimestamp = new Date().toISOString();
    const result = this.cards.get(cardId) || null;
    console.log(`[${logTimestamp}] [MemoryCardRepository.getCard] cardId=${cardId} -> found=${!!result}`);
    return result;
  }
}
