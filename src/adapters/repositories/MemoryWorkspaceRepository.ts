import { Workspace } from "../../entities/workspace";
import { WorkspaceRepository } from "../../usecases/ports/repositories/WorkspaceRepository";

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
    const result = Array.from(this.workspaces.values());
    return result;
  }

  async saveWorkspace(workspace: Workspace): Promise<void> {
    this.workspaces.set(workspace.id, workspace);
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    this.workspaces.delete(workspaceId);
  }
}
