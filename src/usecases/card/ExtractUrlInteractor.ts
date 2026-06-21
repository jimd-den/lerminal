import { Card, createCard } from "../../entities/card";
import { ExtractionGateway } from "../../adapters/gateways/ExtractionGateway";
import { CardRepository } from "../../adapters/repositories/CardRepository";

import { MarkdownChunkerService, MarkdownNode } from "./MarkdownChunkerService";

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

    const tree = MarkdownChunkerService.chunkTree(text, mainTitle);

    // If it has no real heading structure (single intro node), save one source card.
    if (tree.length <= 1 && (tree[0]?.children.length ?? 0) === 0) {
      const card = createCard({
        workspaceId: request.workspaceId,
        type: "source",
        title: tree.length === 1 ? tree[0].title : mainTitle,
        body: tree.length === 1 ? tree[0].body : text,
        cite: request.url,
        parentId: request.parentId,
      });
      await this.cardRepo.saveCard(card);
      return card;
    }

    // Otherwise mirror the document's heading hierarchy as a nested group tree.
    const parentGroup = createCard({
      workspaceId: request.workspaceId,
      type: "group",
      title: mainTitle,
      body: "",
      cite: request.url,
      parentId: request.parentId,
    });
    await this.cardRepo.saveCard(parentGroup);
    await this.saveTree(tree, parentGroup.id, request.url, request.workspaceId);
    return parentGroup;
  }

  /**
   * Recursively persists a heading tree: a node with subsections becomes a `group`
   * (recursing into its children), a leaf becomes a `source` card. Children are saved
   * in reverse so the first section sits on top of the reverse-chronological canvas.
   */
  private async saveTree(
    nodes: MarkdownNode[],
    parentId: string,
    url: string,
    workspaceId: string
  ): Promise<void> {
    for (const node of nodes.slice().reverse()) {
      if (node.children.length === 0) {
        await this.cardRepo.saveCard(createCard({
          workspaceId,
          type: "source",
          title: node.title,
          body: node.body,
          cite: url,
          parentId,
        }));
        continue;
      }

      const group = createCard({
        workspaceId,
        type: "group",
        title: node.title,
        body: "",
        cite: url,
        parentId,
      });
      await this.cardRepo.saveCard(group);
      await this.saveTree(node.children, group.id, url, workspaceId);
    }
  }
}
