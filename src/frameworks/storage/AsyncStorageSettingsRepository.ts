import {
  AppSettings,
  SettingsRepository,
} from "../../usecases/ports/repositories/SettingsRepository";
import { KeyValueStore } from "./KeyValueStore";
import { JsonDocumentStore, JsonStoreOptions } from "./JsonStore";

const SETTINGS_KEY = "learnimal_settings_v1";

/**
 * # AsyncStorage Settings Repository
 *
 * ## Business Value & Purpose
 * Persists the user's local-first preferences — theme, accent, OpenRouter key, model,
 * custom prompts. `null` now means only one thing: nothing has ever been saved. A failed
 * read throws, so the app never silently resets someone's configured key to defaults.
 */
export class AsyncStorageSettingsRepository implements SettingsRepository {
  private readonly settings: JsonDocumentStore<AppSettings>;

  constructor(store: KeyValueStore, options?: JsonStoreOptions) {
    this.settings = new JsonDocumentStore(SETTINGS_KEY, store, "settings", options);
  }

  async getSettings(): Promise<AppSettings | null> {
    return this.settings.read();
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await this.settings.write(settings);
  }
}
