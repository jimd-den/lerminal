/**
 * # Settings Domain Model & Repository Contract
 * 
 * ## Business Value & Purpose
 * This defines the contract for persisting the user's localized configurations.
 * Keeping settings local (theme, custom system prompt, OpenRouter keys) ensures privacy,
 * offline-first usability, and gives the user full control of their experience.
 */

export interface AppSettings {
  theme: "dark" | "light";
  accent: "teal" | "lilac" | "amber" | "rose" | "arctic";
  openRouterKey: string;
  selectedModel: string;
  customSystemPrompt: string;
  customChunkSystemPrompt?: string;
  /** When true, pipelines auto-organize their output into a group per command. */
  autoGroupByCommand: boolean;
  /** Configurable Unix-like site flags for the search command (e.g., wiki: wikipedia.org) */
  searchSiteFlags?: Record<string, string>;
}

export interface SettingsRepository {
  /** Loads the saved AppSettings from storage. Returns null if none are saved. */
  getSettings(): Promise<AppSettings | null>;
  
  /** Saves the updated AppSettings. */
  saveSettings(settings: AppSettings): Promise<void>;
}
