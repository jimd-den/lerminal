import { Card, createCard } from "../../entities/card";
import { ExtractionGateway } from "../ports/gateways/ExtractionGateway";
import { CardRepository } from "../ports/repositories/CardRepository";

export interface ExtractUrlRequest {
  url: string;
  title: string;
  workspaceId: string;
  parentId?: string;
}

/**
 * # ExtractUrlInteractor (Use Case)
 *
 * ## Business Value & Purpose
 * Ingests external web material into ChunkBuddy by extracting Markdown text from a URL
 * and persisting it as a single, un-chunked `source` card. This establishes clean lineage
 * and allows users to explicitly run structural or AI chunking (`split` or `chunk`) when desired.
 *
 * ## Applied Design Patterns
 * - **Use Case / Command Interactor Pattern**: Encapsulates single-responsibility URL ingestion.
 * - **Dependency Inversion**: Relies on abstract `ExtractionGateway` for HTTP/HTML parsing.
 */
export class ExtractUrlInteractor {
  constructor(
    private readonly extractionGateway: ExtractionGateway,
    private readonly cardRepo: CardRepository
  ) {}

  async execute(request: ExtractUrlRequest): Promise<Card> {

    const text = await this.extractionGateway.extractText(request.url);
    const mainTitle = request.title || request.url;

    const sourceCard = createCard({
      workspaceId: request.workspaceId,
      type: "source",
      title: mainTitle,
      body: text,
      cite: request.url,
      parentId: request.parentId,
    });

    await this.cardRepo.saveCard(sourceCard);


    return sourceCard;
  }
}
