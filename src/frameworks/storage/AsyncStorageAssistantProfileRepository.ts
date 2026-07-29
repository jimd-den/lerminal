import AsyncStorage from "@react-native-async-storage/async-storage";
import { AssistantProfile } from "../../entities/assistantProfile";
import { AssistantProfileRepository } from "../../adapters/repositories/AssistantProfileRepository";

const ASSISTANT_PROFILES_KEY = "learnimal_assistant_profiles_v1";

/**
 * # AsyncStorage Assistant Profile Repository
 *
 * ## Business Value & Purpose
 * Persists AI assistance profiles locally using React Native's AsyncStorage.
 */
export class AsyncStorageAssistantProfileRepository implements AssistantProfileRepository {
  async getProfiles(): Promise<AssistantProfile[]> {
    try {
      const data = await AsyncStorage.getItem(ASSISTANT_PROFILES_KEY);
      if (!data) return [];
      return JSON.parse(data) as AssistantProfile[];
    } catch (err: any) {
      console.error("[AsyncStorageAssistantProfileRepository] Failed to read profiles:", err.message);
      return [];
    }
  }

  async saveProfile(profile: AssistantProfile): Promise<void> {
    try {
      const list = await this.getProfiles();
      const index = list.findIndex(p => p.id === profile.id);
      if (index >= 0) list[index] = profile;
      else list.push(profile);
      await AsyncStorage.setItem(ASSISTANT_PROFILES_KEY, JSON.stringify(list));
    } catch (err: any) {
      console.error("[AsyncStorageAssistantProfileRepository] Failed to save profile:", err.message);
    }
  }

  async deleteProfile(id: string): Promise<void> {
    try {
      const list = await this.getProfiles();
      await AsyncStorage.setItem(ASSISTANT_PROFILES_KEY, JSON.stringify(list.filter(p => p.id !== id)));
    } catch (err: any) {
      console.error("[AsyncStorageAssistantProfileRepository] Failed to delete profile:", err.message);
    }
  }
}
