import { CardLink } from "../../../entities/cardLink";

/**
 * # Card Link Repository Interface
 *
 * ## Business Value & Purpose
 * Persists the lightweight, directed associations between cards (see `entities/cardLink.ts`)
 * so a link the Workspace Agent creates via `link_cards` survives across sessions,
 * decoupled from any particular storage engine. Mirrors `ReviewLogRepository`'s shape —
 * an append-only save plus workspace/card-scoped reads.
 */
export interface CardLinkRepository {
  /** Persists a new card link. */
  saveLink(link: CardLink): Promise<void>;

  /** Retrieves all card links for a given workspace. */
  getLinksByWorkspace(workspaceId: string): Promise<CardLink[]>;

  /** Retrieves all links touching a specific card (as either endpoint). */
  getLinksByCard(cardId: string): Promise<CardLink[]>;
}
