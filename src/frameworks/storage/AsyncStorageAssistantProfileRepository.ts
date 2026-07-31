import { AssistantProfile } from "../../entities/assistantProfile";
import { AssistantProfileRepository } from "../../usecases/ports/repositories/AssistantProfileRepository";
import { KeyValueStore } from "./KeyValueStore";
import { JsonCollectionStore, JsonStoreOptions, removeById, upsert } from "./JsonStore";

const ASSISTANT_PROFILES_KEY = "learnimal_assistant_profiles_v1";

const profileId = (profile: AssistantProfile) => profile.id;

/**
 * # AsyncStorage Assistant Profile Repository
 *
 * ## Business Value & Purpose
 * Persists the user's AI assistance profiles — which model and instructions stand behind
 * each capability — so their tuned setup survives restarts.
 */
export class AsyncStorageAssistantProfileRepository implements AssistantProfileRepository {
  private readonly profiles: JsonCollectionStore<AssistantProfile>;

  constructor(store: KeyValueStore, options?: JsonStoreOptions) {
    this.profiles = new JsonCollectionStore(
      ASSISTANT_PROFILES_KEY,
      store,
      "assistantProfiles",
      options,
    );
  }

  async getProfiles(): Promise<AssistantProfile[]> {
    return this.profiles.readAll();
  }

  async saveProfile(profile: AssistantProfile): Promise<void> {
    await this.profiles.mutate((all) => upsert(all, profile, profileId));
  }

  async deleteProfile(id: string): Promise<void> {
    await this.profiles.mutate((all) => removeById(all, id, profileId));
  }
}
