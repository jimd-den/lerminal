import { CommandDefinition } from "../../entities/commandDefinition";
import { CommandDefinitionRepository } from "../../usecases/ports/repositories/CommandDefinitionRepository";
import { KeyValueStore } from "./KeyValueStore";
import { JsonCollectionStore, JsonStoreOptions, removeById, upsert } from "./JsonStore";

/**
 * Storage key. The `learnimal_` prefix is deliberate and must not be renamed with the
 * rest of the app: it is the on-disk contract, and changing it would orphan every
 * workspace, card, and setting a user already has.
 */
const COMMAND_DEFINITIONS_KEY = "learnimal_command_definitions_v1";

const definitionId = (definition: CommandDefinition) => definition.id;

/**
 * # AsyncStorage Command Definition Repository
 *
 * ## Business Value & Purpose
 * Persists the user's custom commands, keeping their bespoke pipeline vocabulary
 * available offline and across launches.
 */
export class AsyncStorageCommandDefinitionRepository implements CommandDefinitionRepository {
  private readonly definitions: JsonCollectionStore<CommandDefinition>;

  constructor(store: KeyValueStore, options?: JsonStoreOptions) {
    this.definitions = new JsonCollectionStore(
      COMMAND_DEFINITIONS_KEY,
      store,
      "commandDefinitions",
      options,
    );
  }

  async getDefinitions(): Promise<CommandDefinition[]> {
    return this.definitions.readAll();
  }

  async saveDefinition(definition: CommandDefinition): Promise<void> {
    await this.definitions.mutate((all) => upsert(all, definition, definitionId));
  }

  async deleteDefinition(id: string): Promise<void> {
    await this.definitions.mutate((all) => removeById(all, id, definitionId));
  }
}
