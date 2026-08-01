import { Workspace } from "../../entities/workspace";
import { WorkspaceRepository } from "../../usecases/ports/repositories/WorkspaceRepository";
import { KeyValueStore } from "./KeyValueStore";
import { JsonCollectionStore, JsonStoreOptions, removeById, upsert } from "./JsonStore";

/**
 * Storage key. The `learnimal_` prefix is deliberate and must not be renamed with the
 * rest of the app: it is the on-disk contract, and changing it would orphan every
 * workspace, card, and setting a user already has.
 */
const WORKSPACES_STORAGE_KEY = "learnimal_workspaces_v1";

const workspaceId = (workspace: Workspace) => workspace.id;

/**
 * # AsyncStorage Workspace Repository
 *
 * ## Business Value & Purpose
 * Persists the user's study folders. Workspaces gate which cards are visible, so a read
 * that silently resolved to empty would look exactly like "all your work is gone" —
 * failures therefore surface instead of returning `[]`.
 */
export class AsyncStorageWorkspaceRepository implements WorkspaceRepository {
  private readonly workspaces: JsonCollectionStore<Workspace>;

  constructor(store: KeyValueStore, options?: JsonStoreOptions) {
    this.workspaces = new JsonCollectionStore(
      WORKSPACES_STORAGE_KEY,
      store,
      "workspaces",
      options,
    );
  }

  async getWorkspaces(): Promise<Workspace[]> {
    return this.workspaces.readAll();
  }

  async saveWorkspace(workspace: Workspace): Promise<void> {
    await this.workspaces.mutate((all) => upsert(all, workspace, workspaceId));
  }

  async deleteWorkspace(id: string): Promise<void> {
    await this.workspaces.mutate((all) => removeById(all, id, workspaceId));
  }
}
