import AsyncStorage from "@react-native-async-storage/async-storage";
import { CardTypeDefinition } from "../../entities/cardTypeDefinition";
import { CardTypeRepository } from "../../adapters/repositories/CardTypeRepository";

const CARD_TYPES_KEY = "learnimal_card_types_v1";

/**
 * # AsyncStorage Card Type Repository
 *
 * ## Business Value & Purpose
 * Persists the card type registry locally, keeping the user's custom card vocabulary
 * (and any restyled built-ins) available offline and across launches.
 */
export class AsyncStorageCardTypeRepository implements CardTypeRepository {
  async getTypes(): Promise<CardTypeDefinition[]> {
    const logTimestamp = new Date().toISOString();
    try {
      const data = await AsyncStorage.getItem(CARD_TYPES_KEY);
      if (!data) return [];
      const list = JSON.parse(data) as CardTypeDefinition[];
      console.log(`[${logTimestamp}] [AsyncStorageCardTypeRepository.getTypes] -> retrieved ${list.length}`);
      return list;
    } catch (err: any) {
      console.error("[AsyncStorageCardTypeRepository] Failed to read types:", err.message);
      return [];
    }
  }

  async saveType(definition: CardTypeDefinition): Promise<void> {
    const logTimestamp = new Date().toISOString();
    try {
      const list = await this.getTypes();
      const index = list.findIndex(t => t.id === definition.id);
      if (index >= 0) list[index] = definition;
      else list.push(definition);
      await AsyncStorage.setItem(CARD_TYPES_KEY, JSON.stringify(list));
      console.log(`[${logTimestamp}] [AsyncStorageCardTypeRepository.saveType] id=${definition.id}`);
    } catch (err: any) {
      console.error("[AsyncStorageCardTypeRepository] Failed to save type:", err.message);
    }
  }

  async deleteType(id: string): Promise<void> {
    const logTimestamp = new Date().toISOString();
    try {
      const list = await this.getTypes();
      await AsyncStorage.setItem(CARD_TYPES_KEY, JSON.stringify(list.filter(t => t.id !== id)));
      console.log(`[${logTimestamp}] [AsyncStorageCardTypeRepository.deleteType] id=${id}`);
    } catch (err: any) {
      console.error("[AsyncStorageCardTypeRepository] Failed to delete type:", err.message);
    }
  }
}
