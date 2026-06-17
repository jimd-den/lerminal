import { CardRepository } from "../../adapters/repositories/CardRepository";
import { chunkCard } from "../commands";
import { EmptySelectionError } from "../errors";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * `chunk` — splits selected source/note/chunk cards into atomic, screen-sized
 * chunk cards and persists them.
 */
export class ChunkCommand implements PipelineCommand {
  readonly name = "chunk";

  constructor(private readonly cardRepo: CardRepository) {}

  async execute(_arg: string, ctx: CommandContext): Promise<CommandResult> {
    const chunkable = ctx.inputCards.filter(
      c => c.type === "source" || c.type === "note" || c.type === "chunk"
    );
    if (chunkable.length === 0) {
      throw new EmptySelectionError("Select source or note to chunk");
    }

    const cards = chunkable
      .flatMap(card => chunkCard(card))
      .map(card => ({ ...card, parentId: ctx.parentId ?? undefined }));
    await this.cardRepo.saveCards(cards);
    return { kind: "cards", cards };
  }
}
