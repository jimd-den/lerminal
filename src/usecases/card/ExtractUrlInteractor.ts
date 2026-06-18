import { Card, createCard } from "../../entities/card";
import { ExtractionGateway } from "../../adapters/gateways/ExtractionGateway";
import { CardRepository } from "../../adapters/repositories/CardRepository";

export interface ExtractUrlRequest {
  url: string;
  title: string;
  workspaceId: string;
  parentId?: string;
}

export class ExtractUrlInteractor {
  constructor(
    private readonly extractionGateway: ExtractionGateway,
    private readonly cardRepo: CardRepository
  ) {}

  async execute(request: ExtractUrlRequest): Promise<Card> {
    const text = await this.extractionGateway.extractText(request.url);

    const card = createCard({
      workspaceId: request.workspaceId,
      type: "source",
      title: request.title || request.url,
      body: text,
      cite: request.url,
      parentId: request.parentId,
    });

    await this.cardRepo.saveCard(card);
    return card;
  }
}
