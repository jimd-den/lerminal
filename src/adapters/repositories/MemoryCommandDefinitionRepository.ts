import { CommandDefinition } from "../../entities/commandDefinition";
import { CommandDefinitionRepository } from "./CommandDefinitionRepository";

/**
 * # Memory Command Definition Repository
 *
 * In-memory implementation for tests and zero-latency fallbacks.
 */
export class MemoryCommandDefinitionRepository implements CommandDefinitionRepository {
  private definitions: Map<string, CommandDefinition> = new Map();

  async getDefinitions(): Promise<CommandDefinition[]> {
    return Array.from(this.definitions.values());
  }

  async saveDefinition(definition: CommandDefinition): Promise<void> {
    this.definitions.set(definition.id, definition);
  }

  async deleteDefinition(id: string): Promise<void> {
    this.definitions.delete(id);
  }
}
