import { CardRepository } from "../../adapters/repositories/CardRepository";
import { WorkspaceRepository } from "../../adapters/repositories/WorkspaceRepository";

/**
 * # Delete Workspace Interactor
 *
 * ## Business Value & Purpose
 * Removes a workspace together with all of its cards, keeping storage consistent
 * (no orphaned cards left behind after a workspace is gone).
 */
export class DeleteWorkspaceInteractor {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly cardRepo: CardRepository
  ) {}

  async execute(workspaceId: string): Promise<void> {
    const cards = await this.cardRepo.getCardsByWorkspace(workspaceId);
    for (const card of cards) {
      await this.cardRepo.deleteCard(card.id);
    }
    await this.workspaceRepo.deleteWorkspace(workspaceId);
  }
}
