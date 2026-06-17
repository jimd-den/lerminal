import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppSettings, SettingsRepository } from "../../adapters/repositories/SettingsRepository";

const SETTINGS_KEY = "learnimal_settings_v1";

/**
 * # AsyncStorage Settings Repository
 * 
 * ## Business Value & Purpose
 * Persists the user's localized preferences (theme, color accent, OpenRouter API keys, model, 
 * and custom system prompts) to AsyncStorage, fulfilling the requirement that all user settings 
 * are stored local-first.
 */
export class AsyncStorageSettingsRepository implements SettingsRepository {
  async getSettings(): Promise<AppSettings | null> {
    const logTimestamp = new Date().toISOString();
    try {
      const data = await AsyncStorage.getItem(SETTINGS_KEY);
      if (!data) return null;
      const settings = JSON.parse(data) as AppSettings;
      console.log(`[${logTimestamp}] [AsyncStorageSettingsRepository.getSettings] -> loaded`);
      return settings;
    } catch (err: any) {
      console.error("[AsyncStorageSettingsRepository] Failed to read settings from disk:", err.message);
      return null;
    }
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const logTimestamp = new Date().toISOString();
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      console.log(`[${logTimestamp}] [AsyncStorageSettingsRepository.saveSettings] saved settings`);
    } catch (err: any) {
      console.error("[AsyncStorageSettingsRepository] Failed to save settings to disk:", err.message);
    }
  }
}
