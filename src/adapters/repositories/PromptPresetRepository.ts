import { PromptPreset } from "../../entities/promptPreset";

/**
 * # Prompt Preset Repository Interface
 *
 * Persists the user's card-generation instruction presets (seeded built-ins plus
 * their own), decoupled from storage so the extendable preset list survives sessions.
 */
export interface PromptPresetRepository {
  getPresets(): Promise<PromptPreset[]>;
  savePreset(preset: PromptPreset): Promise<void>;
  deletePreset(id: string): Promise<void>;
}
