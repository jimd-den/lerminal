import { PromptPreset } from "../../entities/promptPreset";
import { PromptPresetRepository } from "./PromptPresetRepository";

/** In-memory prompt preset store for tests and zero-latency fallbacks. */
export class MemoryPromptPresetRepository implements PromptPresetRepository {
  private presets: Map<string, PromptPreset> = new Map();

  async getPresets(): Promise<PromptPreset[]> {
    return Array.from(this.presets.values());
  }

  async savePreset(preset: PromptPreset): Promise<void> {
    this.presets.set(preset.id, preset);
  }

  async deletePreset(id: string): Promise<void> {
    this.presets.delete(id);
  }
}
