import { CardLink } from "../../entities/cardLink";
import { CardLinkRepository } from "../../usecases/ports/repositories/CardLinkRepository";

/**
 * In-memory implementation of `CardLinkRepository` for unit testing and fast operations.
 */
export class MemoryCardLinkRepository implements CardLinkRepository {
  private links: CardLink[] = [];

  async saveLink(link: CardLink): Promise<void> {
    this.links.push(link);
  }

  async getLinksByWorkspace(workspaceId: string): Promise<CardLink[]> {
    return this.links.filter((l) => l.workspaceId === workspaceId);
  }

  async getLinksByCard(cardId: string): Promise<CardLink[]> {
    return this.links.filter((l) => l.fromCardId === cardId || l.toCardId === cardId);
  }
}
