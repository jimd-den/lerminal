import { AssistantProfile, BUILTIN_ASSISTANT_PROFILES } from "../../entities/assistantProfile";
import { AssistantProfileRepository } from "../../usecases/ports/repositories/AssistantProfileRepository";

/**
 * # In-Memory Assistant Profile Repository
 *
 * ## Business Value & Purpose
 * Memory-backed repository for fast unit testing and ephemeral operations.
 */
export class MemoryAssistantProfileRepository implements AssistantProfileRepository {
  private profiles: Map<string, AssistantProfile>;

  constructor(initial: AssistantProfile[] = BUILTIN_ASSISTANT_PROFILES) {
    this.profiles = new Map(initial.map(p => [p.id, { ...p }]));
  }

  async getProfiles(): Promise<AssistantProfile[]> {
    return Array.from(this.profiles.values());
  }

  async saveProfile(profile: AssistantProfile): Promise<void> {
    this.profiles.set(profile.id, { ...profile, updatedAt: Date.now() });
  }

  async deleteProfile(id: string): Promise<void> {
    this.profiles.delete(id);
  }
}
