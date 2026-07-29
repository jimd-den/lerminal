import { createCard } from "../../entities/card";
import { CardRepository } from "../../adapters/repositories/CardRepository";
import { ExtractionGateway } from "../../adapters/gateways/ExtractionGateway";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * # SourceCommand (`source <url|text>`)
 *
 * ## Business Value & Purpose
 * Ingests external material into ChunkBuddy as an immutable source item (`type: "source"`).
 * - When given a **URL**, it calls the deterministic `ExtractionGateway` infrastructure to fetch
 *   and extract readable Markdown content (e.g. from Wikipedia API or HTML readability parser),
 *   storing the resulting Markdown body along with the canonical URL citation.
 * - When given **plain text**, it creates a source card directly with the user's provided text.
 * - With no argument, it halts the pipeline with `needsInput` (prompting the UI for a source).
 *
 * ## Applied Design Patterns
 * - **Command Pattern**: Encapsulates pipeline source ingestion in a reusable pipeline stage.
 * - **Strategy / Dependency Inversion**: Uses `ExtractionGateway` for deterministic web content
 *   extraction, keeping URL network parsing separate from domain command logic.
 */
export class SourceCommand implements PipelineCommand {
  readonly name = "source";

  constructor(
    private readonly cardRepo: CardRepository,
    private readonly extractionGateway?: ExtractionGateway
  ) {}

  async execute(arg: string, ctx: CommandContext): Promise<CommandResult> {
    const logTimestamp = new Date().toISOString();

    if (!arg) {
      return { kind: "needsInput", mode: "source" };
    }

    const isUrl = /^https?:\/\//i.test(arg.trim());

    if (isUrl) {
      const url = arg.trim();
      const derivedTitle = url
        .replace(/^https?:\/\/(www\.)?/, "")
        .split("/")
        .pop()
        ?.replace(/[-_]/g, " ") || url;

      let extractedBody = url;
      if (this.extractionGateway) {
        try {
          extractedBody = await this.extractionGateway.extractText(url);
        } catch (err: any) {
          console.warn(`[${logTimestamp}] [SourceCommand.execute] Failed URL extraction, falling back to raw URL: ${err.message}`);
          extractedBody = `Extraction failed for ${url}: ${err.message}`;
        }
      }

      const sourceCard = createCard({
        workspaceId: ctx.workspaceId,
        type: "source",
        title: derivedTitle,
        body: extractedBody,
        cite: url,
        parentId: ctx.parentId ?? undefined,
      });

      await this.cardRepo.saveCard(sourceCard);

      console.log(
        `[${logTimestamp}] [SourceCommand.execute] URL Ingested | url=${url} | cardId=${sourceCard.id}`
      );

      return { kind: "cards", cards: [sourceCard] };
    }

    // Direct plain text ingestion
    const textContent = arg.trim();
    const title = textContent.substring(0, 40);

    const sourceCard = createCard({
      workspaceId: ctx.workspaceId,
      type: "source",
      title,
      body: textContent,
      cite: "user source",
      parentId: ctx.parentId ?? undefined,
    });

    await this.cardRepo.saveCard(sourceCard);

    console.log(
      `[${logTimestamp}] [SourceCommand.execute] Text Ingested | title="${title}" | cardId=${sourceCard.id}`
    );

    return { kind: "cards", cards: [sourceCard] };
  }
}
