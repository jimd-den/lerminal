import { AppSettings, SettingsRepository } from "../../adapters/repositories/SettingsRepository";

/**
 * # Save Settings Interactor
 *
 * ## Business Value & Purpose
 * Persists the user's local configuration (theme, accent, key, model, prompt).
 * Centralizing persistence behind one use case keeps every settings mutation in
 * the presenter consistent.
 */
export class SaveSettingsInteractor {
  constructor(private readonly settingsRepo: SettingsRepository) {}

  async execute(settings: AppSettings): Promise<void> {
    await this.settingsRepo.saveSettings(settings);
  }
}
