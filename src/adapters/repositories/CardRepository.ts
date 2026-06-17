import { Card } from "../../entities/card";

/**
 * # Card Repository Interface
 * 
 * ## Business Value & Purpose
 * This interface defines the data contract for persisting and retrieving learning cards.
 * By decoupling the store interface from its implementation, we can easily swap between
 * SQLite, AsyncStorage, or Memory-based storage without affecting the business logic.
 */
export interface CardRepository {
  /** Retrieves all cards belonging to a specific workspace. */
  getCardsByWorkspace(workspaceId: string): Promise<Card[]>;
  
  /** Persists a single card to storage. */
  saveCard(card: Card): Promise<void>;
  
  /** Persists multiple cards atomically to storage. */
  saveCards(cards: Card[]): Promise<void>;
  
  /** Deletes a card by its unique ID. */
  deleteCard(cardId: string): Promise<void>;
  
  /** Fetches a single card by its unique ID. */
  getCard(cardId: string): Promise<Card | null>;
}
