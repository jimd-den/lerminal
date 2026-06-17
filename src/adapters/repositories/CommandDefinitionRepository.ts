import { CommandDefinition } from "../../entities/commandDefinition";

/**
 * # Command Definition Repository Interface
 *
 * ## Business Value & Purpose
 * Persists the user's custom commands so their tailored pipeline vocabulary
 * survives across sessions, decoupled from any particular storage engine.
 */
export interface CommandDefinitionRepository {
  /** Retrieves all custom command definitions. */
  getDefinitions(): Promise<CommandDefinition[]>;

  /** Persists (inserts or updates) a command definition. */
  saveDefinition(definition: CommandDefinition): Promise<void>;

  /** Deletes a command definition by id. */
  deleteDefinition(id: string): Promise<void>;
}
