import { createCard } from "../../entities/card";
import { Logger, silentLogger } from "../ports/Logger";
import { CardRepository } from "../ports/repositories/CardRepository";
import { ExtractionGateway } from "../ports/gateways/ExtractionGateway";
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
    private readonly extractionGateway?: ExtractionGateway,
    private readonly logger: Logger = silentLogger
  ) {}

  async execute(arg: string, ctx: CommandContext): Promise<CommandResult> {

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
          // The card is still created, but holds the URL rather than its text — the user
          // should be able to find out why what they saved looks thinner than expected.
          this.logger.warn("source.extractionFailed.fallbackToUrl", {
            reason: err.message,
          });
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


    return { kind: "cards", cards: [sourceCard] };
  }
}
