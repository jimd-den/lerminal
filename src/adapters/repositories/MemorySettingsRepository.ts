import { AppSettings, SettingsRepository } from "./SettingsRepository";

/**
 * # Memory Settings Repository
 * 
 * ## Business Value & Purpose
 * Mock implementation of settings persistence for test suites and memory fallbacks.
 */
export class MemorySettingsRepository implements SettingsRepository {
  private settings: AppSettings | null = null;

  async getSettings(): Promise<AppSettings | null> {
    const logTimestamp = new Date().toISOString();
    console.log(`[${logTimestamp}] [MemorySettingsRepository.getSettings] -> found=${!!this.settings}`);
    return this.settings;
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const logTimestamp = new Date().toISOString();
    this.settings = { ...settings };
    console.log(`[${logTimestamp}] [MemorySettingsRepository.saveSettings] saved settings`);
  }
}
