import AsyncStorage from "@react-native-async-storage/async-storage";
import { Card } from "../../entities/card";
import { CardRepository } from "../../adapters/repositories/CardRepository";

const CARDS_STORAGE_KEY = "learnimal_cards_v1";

/**
 * # AsyncStorage Card Repository
 * 
 * ## Business Value & Purpose
 * Implements persistent card storage using React Native's standard asynchronous,
 * local key-value store. This ensures user notes, sources, chunk cards, and schedules
 * are durable across app restarts and updates.
 */
export class AsyncStorageCardRepository implements CardRepository {
  private async getAllCards(): Promise<Card[]> {
    try {
      const data = await AsyncStorage.getItem(CARDS_STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data) as Card[];
    } catch (err: any) {
      console.error("[AsyncStorageCardRepository] Failed to read cards from disk:", err.message);
      return [];
    }
  }

  private async saveAllCards(cards: Card[]): Promise<void> {
    try {
      await AsyncStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(cards));
    } catch (err: any) {
      console.error("[AsyncStorageCardRepository] Failed to write cards to disk:", err.message);
    }
  }

  async getCardsByWorkspace(workspaceId: string): Promise<Card[]> {
    const logTimestamp = new Date().toISOString();
    const all = await this.getAllCards();
    const filtered = all.filter(card => card.workspaceId === workspaceId);
    console.log(`[${logTimestamp}] [AsyncStorageCardRepository.getCardsByWorkspace] workspaceId=${workspaceId} -> retrieved ${filtered.length} cards`);
    return filtered;
  }

  async saveCard(card: Card): Promise<void> {
    const logTimestamp = new Date().toISOString();
    const all = await this.getAllCards();
    const index = all.findIndex(c => c.id === card.id);
    
    if (index >= 0) {
      all[index] = card;
    } else {
      all.push(card);
    }
    
    await this.saveAllCards(all);
    console.log(`[${logTimestamp}] [AsyncStorageCardRepository.saveCard] cardId=${card.id}`);
  }

  async saveCards(cards: Card[]): Promise<void> {
    const logTimestamp = new Date().toISOString();
    const all = await this.getAllCards();
    
    for (const card of cards) {
      const index = all.findIndex(c => c.id === card.id);
      if (index >= 0) {
        all[index] = card;
      } else {
        all.push(card);
      }
    }
    
    await this.saveAllCards(all);
    console.log(`[${logTimestamp}] [AsyncStorageCardRepository.saveCards] saved ${cards.length} cards`);
  }

  async deleteCard(cardId: string): Promise<void> {
    const logTimestamp = new Date().toISOString();
    const all = await this.getAllCards();
    const filtered = all.filter(card => card.id !== cardId);
    
    await this.saveAllCards(filtered);
    console.log(`[${logTimestamp}] [AsyncStorageCardRepository.deleteCard] cardId=${cardId}`);
  }

  async getCard(cardId: string): Promise<Card | null> {
    const logTimestamp = new Date().toISOString();
    const all = await this.getAllCards();
    const card = all.find(c => c.id === cardId) || null;
    console.log(`[${logTimestamp}] [AsyncStorageCardRepository.getCard] cardId=${cardId} -> found=${!!card}`);
    return card;
  }
}
