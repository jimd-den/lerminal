import { PromptPreset } from "../../entities/promptPreset";
import { PromptPresetRepository } from "../../usecases/ports/repositories/PromptPresetRepository";
import { KeyValueStore } from "./KeyValueStore";
import { JsonCollectionStore, JsonStoreOptions, removeById, upsert } from "./JsonStore";

const PROMPT_PRESETS_KEY = "learnimal_prompt_presets_v1";

const presetId = (preset: PromptPreset) => preset.id;

/** Persists card-generation instruction presets locally, available offline. */
export class AsyncStoragePromptPresetRepository implements PromptPresetRepository {
  private readonly presets: JsonCollectionStore<PromptPreset>;

  constructor(store: KeyValueStore, options?: JsonStoreOptions) {
    this.presets = new JsonCollectionStore(
      PROMPT_PRESETS_KEY,
      store,
      "promptPresets",
      options,
    );
  }

  async getPresets(): Promise<PromptPreset[]> {
    return this.presets.readAll();
  }

  async savePreset(preset: PromptPreset): Promise<void> {
    await this.presets.mutate((all) => upsert(all, preset, presetId));
  }

  async deletePreset(id: string): Promise<void> {
    await this.presets.mutate((all) => removeById(all, id, presetId));
  }
}
