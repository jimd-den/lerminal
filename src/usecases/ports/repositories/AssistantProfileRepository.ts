import { AssistantProfile } from "../../../entities/assistantProfile";

/**
 * # Assistant Profile Repository Port
 *
 * ## Business Value & Purpose
 * Persists user-authored and built-in AI assistance profiles across application restarts,
 * decoupled from underlying storage engines (AsyncStorage, SQLite, Memory).
 */
export interface AssistantProfileRepository {
  getProfiles(): Promise<AssistantProfile[]>;
  saveProfile(profile: AssistantProfile): Promise<void>;
  deleteProfile(id: string): Promise<void>;
}
