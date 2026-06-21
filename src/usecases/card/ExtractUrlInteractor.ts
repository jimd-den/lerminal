import { Card, createCard } from "../../entities/card";
import { ExtractionGateway } from "../../adapters/gateways/ExtractionGateway";
import { CardRepository } from "../../adapters/repositories/CardRepository";

import { MarkdownChunkerService } from "./MarkdownChunkerService";

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
    const mainTitle = request.title || request.url;

    const sections = MarkdownChunkerService.chunk(text, mainTitle);

    // If it didn't chunk (only 1 section), just save as a single source card
    if (sections.length <= 1) {
      const card = createCard({
        workspaceId: request.workspaceId,
        type: "source",
        title: sections.length === 1 ? sections[0].title : mainTitle,
        body: sections.length === 1 ? sections[0].body : text,
        cite: request.url,
        parentId: request.parentId,
      });
      await this.cardRepo.saveCard(card);
      return card;
    }

    // If there are multiple sections, create a parent group and nest the chunks
    const parentGroup = createCard({
      workspaceId: request.workspaceId,
      type: "group",
      title: mainTitle,
      body: "",
      cite: request.url,
      parentId: request.parentId,
    });
    await this.cardRepo.saveCard(parentGroup);

    // The UI displays visible cards in reverse chronological order (newest at top).
    // By saving the chunks in reverse order, the first section is saved last,
    // which pushes it to the very top of the list in the Lerminal workspace!
    for (const section of sections.slice().reverse()) {
      const childCard = createCard({
        workspaceId: request.workspaceId,
        type: "source",
        title: section.title,
        body: section.body,
        cite: request.url,
        parentId: parentGroup.id,
      });
      await this.cardRepo.saveCard(childCard);
    }

    return parentGroup;
  }
}
