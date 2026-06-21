import AsyncStorage from "@react-native-async-storage/async-storage";
import { PromptPreset } from "../../entities/promptPreset";
import { PromptPresetRepository } from "../../adapters/repositories/PromptPresetRepository";

const PROMPT_PRESETS_KEY = "learnimal_prompt_presets_v1";

/** Persists card-generation instruction presets locally, available offline. */
export class AsyncStoragePromptPresetRepository implements PromptPresetRepository {
  async getPresets(): Promise<PromptPreset[]> {
    try {
      const data = await AsyncStorage.getItem(PROMPT_PRESETS_KEY);
      if (!data) return [];
      return JSON.parse(data) as PromptPreset[];
    } catch (err: any) {
      console.error("[AsyncStoragePromptPresetRepository] Failed to read presets:", err.message);
      return [];
    }
  }

  async savePreset(preset: PromptPreset): Promise<void> {
    try {
      const list = await this.getPresets();
      const index = list.findIndex(p => p.id === preset.id);
      if (index >= 0) list[index] = preset;
      else list.push(preset);
      await AsyncStorage.setItem(PROMPT_PRESETS_KEY, JSON.stringify(list));
    } catch (err: any) {
      console.error("[AsyncStoragePromptPresetRepository] Failed to save preset:", err.message);
    }
  }

  async deletePreset(id: string): Promise<void> {
    try {
      const list = await this.getPresets();
      await AsyncStorage.setItem(PROMPT_PRESETS_KEY, JSON.stringify(list.filter(p => p.id !== id)));
    } catch (err: any) {
      console.error("[AsyncStoragePromptPresetRepository] Failed to delete preset:", err.message);
    }
  }
}
