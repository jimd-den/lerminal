import { CardTypeDefinition } from "../../entities/cardTypeDefinition";
import { CardTypeRepository } from "./CardTypeRepository";

/**
 * # Memory Card Type Repository
 *
 * In-memory implementation for tests and zero-latency fallbacks. Starts empty;
 * seeding of the built-in definitions is the caller's responsibility (the controller
 * seeds on first load), keeping this a dumb store.
 */
export class MemoryCardTypeRepository implements CardTypeRepository {
  private types: Map<string, CardTypeDefinition> = new Map();

  async getTypes(): Promise<CardTypeDefinition[]> {
    return Array.from(this.types.values());
  }

  async saveType(definition: CardTypeDefinition): Promise<void> {
    this.types.set(definition.id, definition);
  }

  async deleteType(id: string): Promise<void> {
    this.types.delete(id);
  }
}
