import { createWorkspace, Workspace } from "../../entities/workspace";
import { WorkspaceRepository } from "../../adapters/repositories/WorkspaceRepository";

/**
 * # Create Workspace Interactor
 *
 * ## Business Value & Purpose
 * Creates a new named learning scope and persists it. A freshly created workspace
 * starts empty, so there are no cards to return.
 */
export class CreateWorkspaceInteractor {
  constructor(private readonly workspaceRepo: WorkspaceRepository) {}

  async execute(name: string): Promise<Workspace> {
    const workspace = createWorkspace({ name });
    await this.workspaceRepo.saveWorkspace(workspace);
    return workspace;
  }
}
