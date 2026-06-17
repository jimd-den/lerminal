import { Card } from "../../entities/card";
import { CardRepository } from "../../adapters/repositories/CardRepository";

/**
 * # Switch Workspace Interactor
 *
 * ## Business Value & Purpose
 * Loads the cards for a workspace the user is switching into. Switching is the only
 * context switch in Learnimal, so this keeps the active card stream in sync.
 */
export class SwitchWorkspaceInteractor {
  constructor(private readonly cardRepo: CardRepository) {}

  async execute(workspaceId: string): Promise<Card[]> {
    return this.cardRepo.getCardsByWorkspace(workspaceId);
  }
}
