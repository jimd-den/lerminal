import { CardRepository } from "../../adapters/repositories/CardRepository";
import { WorkspaceRepository } from "../../adapters/repositories/WorkspaceRepository";

/**
 * # Restart Onboarding Interactor
 *
 * ## Business Value & Purpose
 * Wipes all persisted workspaces and cards so the user can start over from a cold
 * onboarding state. Storage is left empty and consistent.
 */
export class RestartOnboardingInteractor {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly cardRepo: CardRepository
  ) {}

  async execute(): Promise<void> {
    const workspaces = await this.workspaceRepo.getWorkspaces();
    for (const ws of workspaces) {
      const cards = await this.cardRepo.getCardsByWorkspace(ws.id);
      for (const card of cards) {
        await this.cardRepo.deleteCard(card.id);
      }
      await this.workspaceRepo.deleteWorkspace(ws.id);
    }
  }
}
