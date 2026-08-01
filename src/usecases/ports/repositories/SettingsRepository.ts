/**
 * # Settings Domain Model & Repository Contract
 * 
 * ## Business Value & Purpose
 * This defines the contract for persisting the user's localized configurations.
 * Keeping settings local (theme, custom system prompt, OpenRouter keys) ensures privacy,
 * offline-first usability, and gives the user full control of their experience.
 */

import { AppearanceSettings } from "../../../entities/appearance";
import { AgentPromptOverrides } from "../../../entities/agentPrompts";

export interface AppSettings {
  theme: "dark" | "light";
  accent: "teal" | "lilac" | "amber" | "rose" | "arctic";
  /**
   * Palette and typeface choices. Optional so settings written before appearance
   * customisation existed load as the default console — see `resolveAppearance`.
   */
  appearance?: AppearanceSettings;
  openRouterKey: string;
  selectedModel: string;
  customSystemPrompt: string;
  customChunkSystemPrompt?: string;
  /** Selected assistant profile per AI capability. */
  activeProfileIds?: Record<string, string>;
  /** When true, pipelines auto-organize their output into a group per command. */
  autoGroupByCommand: boolean;
  /** When true, review sessions interleave cards across topics/groups (vs blocking). */
  interleaveReviews?: boolean;
  /** Configurable Unix-like site flags for the search command (e.g., wiki: wikipedia.org) */
  searchSiteFlags?: Record<string, string>;
  /**
   * The user's rewritten agent prompt bodies, by id. Optional so blobs written before
   * the prompt registry existed load unchanged, with every prompt at its default.
   *
   * Only the *editable* layer is stored: the parent rules and each capability's output
   * contract are composed at send time and are not persisted, so they cannot be lost,
   * corrupted, or edited out through storage.
   */
  agentPromptOverrides?: AgentPromptOverrides;
  /**
   * Whether the model provider's own web search rides along with agent calls.
   * Optional and **absent means on** — a blob written before this existed gets the new
   * default rather than being read as an explicit opt-out.
   */
  webSearchEnabled?: boolean;
}

export interface SettingsRepository {
  /** Loads the saved AppSettings from storage. Returns null if none are saved. */
  getSettings(): Promise<AppSettings | null>;
  
  /** Saves the updated AppSettings. */
  saveSettings(settings: AppSettings): Promise<void>;
}
