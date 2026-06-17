import { Card } from "../../entities/card";
import { CardRepository } from "../../adapters/repositories/CardRepository";
import { directChildren } from "../tree";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * `ungroup` — dissolves the selected group cards: their direct children are
 * re-parented up to the group's own parent and the group node is deleted.
 * Non-group input cards pass through untouched. Outputs the freed children plus
 * any passed-through cards.
 */
export class UngroupCommand implements PipelineCommand {
  readonly name = "ungroup";

  constructor(private readonly cardRepo: CardRepository) {}

  async execute(_arg: string, ctx: CommandContext): Promise<CommandResult> {
    const groups = ctx.inputCards.filter(c => c.type === "group");
    if (groups.length === 0) {
      // Nothing to dissolve; pass the selection through unchanged.
      return { kind: "cards", cards: ctx.inputCards };
    }

    const allCards = await this.cardRepo.getCardsByWorkspace(ctx.workspaceId);
    const freed: Card[] = [];

    for (const group of groups) {
      for (const child of directChildren(allCards, group.id)) {
        const reparented = { ...child, parentId: group.parentId };
        await this.cardRepo.saveCard(reparented);
        freed.push(reparented);
      }
      await this.cardRepo.deleteCard(group.id);
    }

    const passthrough = ctx.inputCards.filter(c => c.type !== "group");
    return { kind: "cards", cards: [...passthrough, ...freed] };
  }
}
