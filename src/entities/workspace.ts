/**
 * # Workspace Entity Domain Model
 * 
 * ## Business Value & Purpose
 * A Workspace defines a named scope for learning a specific subject (e.g., "Linear Algebra").
 * In Learnimal, all card streams and spaced repetition schedules are scoped to a workspace.
 * Switching workspaces is the only context switch in the application, keeping the cognitive
 * load minimal.
 */

export interface Workspace {
  /** Unique identifier for the workspace. */
  id: string;
  /** The name of the workspace, representing the subject being learned. truncated to fit mobile screen. */
  name: string;
  /** Epoch timestamp of workspace creation. */
  createdAt: number;
}

export interface CreateWorkspaceParams {
  id?: string;
  name: string;
  createdAt?: number;
}

/**
 * Factory function to instantiate a valid Workspace entity.
 * Automatically enforces a maximum name length of 22 characters for clean UI styling.
 * 
 * @param params Construction parameters for the workspace.
 * @returns A fully initialized Workspace.
 */
export function createWorkspace(params: CreateWorkspaceParams): Workspace {
  const logTimestamp = new Date().toISOString();
  
  const generatedId = params.id || Math.random().toString(36).substring(2, 10);
  const createdTime = params.createdAt || Date.now();

  // Enforce name length limit for display cleanliness (maximum 22 characters)
  const trimmedName = params.name.trim();
  const displayName = trimmedName.length > 22 
    ? trimmedName.substring(0, 22) + "…" 
    : trimmedName;

  const workspace: Workspace = {
    id: generatedId,
    name: displayName,
    createdAt: createdTime,
  };

  console.log(`[${logTimestamp}] [createWorkspace] INPUTS: params=${JSON.stringify(params)} | OUTPUT: ${JSON.stringify(workspace)}`);
  return workspace;
}
