import { AppSettings, SettingsRepository } from "../../usecases/ports/repositories/SettingsRepository";

/**
 * # Memory Settings Repository
 * 
 * ## Business Value & Purpose
 * Mock implementation of settings persistence for test suites and memory fallbacks.
 */
export class MemorySettingsRepository implements SettingsRepository {
  private settings: AppSettings | null = null;

  async getSettings(): Promise<AppSettings | null> {
    return this.settings;
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    this.settings = { ...settings };
  }
}
