import { CardTypeDefinition } from "../../entities/cardTypeDefinition";

/**
 * # Card Type Repository Interface
 *
 * ## Business Value & Purpose
 * Persists the registry of card type definitions — both the seeded built-ins and the
 * user's own types — so a learner's bespoke card vocabulary survives across sessions,
 * decoupled from any particular storage engine.
 */
export interface CardTypeRepository {
  /** Retrieves all card type definitions (built-in + custom). */
  getTypes(): Promise<CardTypeDefinition[]>;

  /** Persists (inserts or updates) a card type definition. */
  saveType(definition: CardTypeDefinition): Promise<void>;

  /** Deletes a custom card type definition by id. */
  deleteType(id: string): Promise<void>;
}
