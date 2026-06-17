import { Workspace } from "../../entities/workspace";

/**
 * # Workspace Repository Interface
 * 
 * ## Business Value & Purpose
 * Defines the contract for persisting learning workspaces. This abstraction allows
 * the app to load and switch learning contexts dynamically while maintaining clean separation.
 */
export interface WorkspaceRepository {
  /** Retrieves all workspaces. */
  getWorkspaces(): Promise<Workspace[]>;
  
  /** Saves a workspace. */
  saveWorkspace(workspace: Workspace): Promise<void>;
  
  /** Deletes a workspace and its configuration. */
  deleteWorkspace(workspaceId: string): Promise<void>;
}
