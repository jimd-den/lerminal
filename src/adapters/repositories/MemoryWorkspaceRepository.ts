import { Workspace } from "../../entities/workspace";
import { WorkspaceRepository } from "./WorkspaceRepository";

/**
 * # Memory Workspace Repository
 * 
 * ## Business Value & Purpose
 * Provides mock/in-memory storage for workspaces. Used primarily during testing and
 * development to simulate data-access operations without external engine side effects.
 */
export class MemoryWorkspaceRepository implements WorkspaceRepository {
  private workspaces: Map<string, Workspace> = new Map();

  async getWorkspaces(): Promise<Workspace[]> {
    const logTimestamp = new Date().toISOString();
    const result = Array.from(this.workspaces.values());
    console.log(`[${logTimestamp}] [MemoryWorkspaceRepository.getWorkspaces] -> returned ${result.length} workspaces`);
    return result;
  }

  async saveWorkspace(workspace: Workspace): Promise<void> {
    const logTimestamp = new Date().toISOString();
    this.workspaces.set(workspace.id, workspace);
    console.log(`[${logTimestamp}] [MemoryWorkspaceRepository.saveWorkspace] workspaceId=${workspace.id}`);
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    const logTimestamp = new Date().toISOString();
    this.workspaces.delete(workspaceId);
    console.log(`[${logTimestamp}] [MemoryWorkspaceRepository.deleteWorkspace] workspaceId=${workspaceId}`);
  }
}
