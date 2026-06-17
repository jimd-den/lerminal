import { Card, createCard } from "../../entities/card";
import { CardRepository } from "../../adapters/repositories/CardRepository";
import { EmptySelectionError } from "../errors";
import { selectionRoots } from "../tree";

/** Inputs for bundling cards under a new group. */
export interface GroupCardsRequest {
  workspaceId: string;
  /** The group the new container is created under (null = workspace root). */
  parentId: string | null;
  /** Display name for the new group. */
  name: string;
  /** The cards to nest under the new group. */
  cards: Card[];
}

/**
 * # Group Cards Interactor
 *
 * ## Business Value & Purpose
 * The single grouping primitive: it creates a new `group` card and re-parents the
 * given cards beneath it. Only the *roots* of the input are re-parented, so any
 * substructure the cards already form rides along intact rather than flattening.
 * Both the manual `group` command and auto-grouping reuse this one use case, which
 * keeps grouping modular — there is exactly one place that builds the tree.
 */
export class GroupCardsInteractor {
  constructor(private readonly cardRepo: CardRepository) {}

  /**
   * @returns The newly created group card.
   * @throws {EmptySelectionError} when there are no cards to group.
   */
  async execute(request: GroupCardsRequest): Promise<Card> {
    if (request.cards.length === 0) {
      throw new EmptySelectionError("Select cards to group");
    }

    const group = createCard({
      workspaceId: request.workspaceId,
      type: "group",
      title: request.name,
      body: "",
      parentId: request.parentId ?? undefined,
    });
    await this.cardRepo.saveCard(group);

    for (const root of selectionRoots(request.cards)) {
      await this.cardRepo.saveCard({ ...root, parentId: group.id });
    }

    return group;
  }
}
