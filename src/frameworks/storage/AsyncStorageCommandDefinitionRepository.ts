import AsyncStorage from "@react-native-async-storage/async-storage";
import { CommandDefinition } from "../../entities/commandDefinition";
import { CommandDefinitionRepository } from "../../adapters/repositories/CommandDefinitionRepository";

const COMMAND_DEFINITIONS_KEY = "learnimal_command_definitions_v1";

/**
 * # AsyncStorage Command Definition Repository
 *
 * ## Business Value & Purpose
 * Persists the user's custom commands locally, keeping their bespoke pipeline
 * vocabulary available offline and across launches.
 */
export class AsyncStorageCommandDefinitionRepository implements CommandDefinitionRepository {
  async getDefinitions(): Promise<CommandDefinition[]> {
    const logTimestamp = new Date().toISOString();
    try {
      const data = await AsyncStorage.getItem(COMMAND_DEFINITIONS_KEY);
      if (!data) return [];
      const list = JSON.parse(data) as CommandDefinition[];
      console.log(`[${logTimestamp}] [AsyncStorageCommandDefinitionRepository.getDefinitions] -> retrieved ${list.length}`);
      return list;
    } catch (err: any) {
      console.error("[AsyncStorageCommandDefinitionRepository] Failed to read definitions:", err.message);
      return [];
    }
  }

  async saveDefinition(definition: CommandDefinition): Promise<void> {
    const logTimestamp = new Date().toISOString();
    try {
      const list = await this.getDefinitions();
      const index = list.findIndex(d => d.id === definition.id);
      if (index >= 0) list[index] = definition;
      else list.push(definition);
      await AsyncStorage.setItem(COMMAND_DEFINITIONS_KEY, JSON.stringify(list));
      console.log(`[${logTimestamp}] [AsyncStorageCommandDefinitionRepository.saveDefinition] id=${definition.id}`);
    } catch (err: any) {
      console.error("[AsyncStorageCommandDefinitionRepository] Failed to save definition:", err.message);
    }
  }

  async deleteDefinition(id: string): Promise<void> {
    const logTimestamp = new Date().toISOString();
    try {
      const list = await this.getDefinitions();
      await AsyncStorage.setItem(COMMAND_DEFINITIONS_KEY, JSON.stringify(list.filter(d => d.id !== id)));
      console.log(`[${logTimestamp}] [AsyncStorageCommandDefinitionRepository.deleteDefinition] id=${id}`);
    } catch (err: any) {
      console.error("[AsyncStorageCommandDefinitionRepository] Failed to delete definition:", err.message);
    }
  }
}
