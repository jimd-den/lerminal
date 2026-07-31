import { CardLink } from "../../entities/cardLink";
import { CardLinkRepository } from "../../usecases/ports/repositories/CardLinkRepository";
import { KeyValueStore } from "./KeyValueStore";
import { JsonCollectionStore, JsonStoreOptions } from "./JsonStore";

const STORAGE_KEY = "learnimal_card_links_v1";

/**
 * # AsyncStorage Card Link Repository
 *
 * ## Business Value & Purpose
 * Persists card links (see `entities/cardLink.ts`) so a "linked notes" relationship the
 * Workspace Agent created survives offline and across launches.
 */
export class AsyncStorageCardLinkRepository implements CardLinkRepository {
  private readonly links: JsonCollectionStore<CardLink>;

  constructor(store: KeyValueStore, options?: JsonStoreOptions) {
    this.links = new JsonCollectionStore(STORAGE_KEY, store, "cardLinks", options);
  }

  async saveLink(link: CardLink): Promise<void> {
    await this.links.mutate((all) => [...all, link]);
  }

  async getLinksByWorkspace(workspaceId: string): Promise<CardLink[]> {
    const all = await this.links.readAll();
    return all.filter((l) => l.workspaceId === workspaceId);
  }

  async getLinksByCard(cardId: string): Promise<CardLink[]> {
    const all = await this.links.readAll();
    return all.filter((l) => l.fromCardId === cardId || l.toCardId === cardId);
  }
}
