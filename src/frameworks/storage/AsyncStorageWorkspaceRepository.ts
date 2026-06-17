import AsyncStorage from "@react-native-async-storage/async-storage";
import { Workspace } from "../../entities/workspace";
import { WorkspaceRepository } from "../../adapters/repositories/WorkspaceRepository";

const WORKSPACES_STORAGE_KEY = "learnimal_workspaces_v1";

/**
 * # AsyncStorage Workspace Repository
 * 
 * ## Business Value & Purpose
 * Manages the persistence of workspaces using AsyncStorage. Swapping workspaces changes
 * the user's focus. Saving this metadata persistently ensures users retain their study folders.
 */
export class AsyncStorageWorkspaceRepository implements WorkspaceRepository {
  async getWorkspaces(): Promise<Workspace[]> {
    const logTimestamp = new Date().toISOString();
    try {
      const data = await AsyncStorage.getItem(WORKSPACES_STORAGE_KEY);
      if (!data) return [];
      const list = JSON.parse(data) as Workspace[];
      console.log(`[${logTimestamp}] [AsyncStorageWorkspaceRepository.getWorkspaces] -> retrieved ${list.length} workspaces`);
      return list;
    } catch (err: any) {
      console.error("[AsyncStorageWorkspaceRepository] Failed to read workspaces from disk:", err.message);
      return [];
    }
  }

  async saveWorkspace(workspace: Workspace): Promise<void> {
    const logTimestamp = new Date().toISOString();
    try {
      const workspaces = await this.getWorkspaces();
      const index = workspaces.findIndex(w => w.id === workspace.id);
      
      if (index >= 0) {
        workspaces[index] = workspace;
      } else {
        workspaces.push(workspace);
      }
      
      await AsyncStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(workspaces));
      console.log(`[${logTimestamp}] [AsyncStorageWorkspaceRepository.saveWorkspace] workspaceId=${workspace.id}`);
    } catch (err: any) {
      console.error("[AsyncStorageWorkspaceRepository] Failed to write workspace to disk:", err.message);
    }
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    const logTimestamp = new Date().toISOString();
    try {
      const workspaces = await this.getWorkspaces();
      const filtered = workspaces.filter(w => w.id !== workspaceId);
      
      await AsyncStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(filtered));
      console.log(`[${logTimestamp}] [AsyncStorageWorkspaceRepository.deleteWorkspace] workspaceId=${workspaceId}`);
    } catch (err: any) {
      console.error("[AsyncStorageWorkspaceRepository] Failed to delete workspace on disk:", err.message);
    }
  }
}
