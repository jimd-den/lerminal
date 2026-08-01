import { CardRepository } from "../ports/repositories/CardRepository";
import { Card, createCard } from "../../entities/card";
import { chunkCard } from "../../entities/chunking";
import { MarkdownChunkerService, MarkdownNode } from "../card/MarkdownChunkerService";
import { EmptySelectionError } from "../errors";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * # SplitCommand (`split`)
 *
 * ## Business Value & Purpose
 * `split` performs offline, deterministic structural splitting of selected source, note,
 * or chunk cards into sections matching the document's own Markdown heading hierarchy (H1..H3)
 * or paragraph structure. It places the source card and all generated chunks inside a unified
 * Document Container Group (`title: source.title`, `documentGroupFor: source.id`).
 *
 * ## Applied Design Patterns
 * - **Command Pattern**: Encapsulates structural document splitting into a pipeline stage.
 * - **Container / Aggregate Root Pattern**: Wraps source and derived chunks inside a document group.
 */
export class SplitCommand implements PipelineCommand {
  readonly name = "split";

  constructor(private readonly cardRepo: CardRepository) {}

  async execute(_arg: string, ctx: CommandContext): Promise<CommandResult> {

    const chunkable = ctx.inputCards.filter(
      c => c.type === "source" || c.type === "note" || c.type === "chunk"
    );
    if (chunkable.length === 0) {
      throw new EmptySelectionError("Select source, note, or chunk to split");
    }

    const created: Card[] = [];

    for (const source of chunkable) {
      const docGroup = await this.ensureDocumentGroup(source, ctx);
      const sourceRef = source.sourceRef || source.id;
      const sections = MarkdownChunkerService.chunk(source.body, source.title);

      if (sections.length <= 1) {
        const generated = chunkCard(source).map(c => ({ ...c, parentId: docGroup.id }));
        created.push(...generated);
        continue;
      }

      const tree = MarkdownChunkerService.chunkTree(source.body, source.title);
      this.materialize(tree, docGroup.id, source, sourceRef, ctx.workspaceId, created);
    }

    if (created.length === 0) {
      throw new EmptySelectionError("Nothing to split");
    }

    await this.cardRepo.saveCards(created);

    return { kind: "cards", cards: created };
  }

  private async ensureDocumentGroup(
    source: Card,
    ctx: CommandContext
  ): Promise<Card> {
    const allWorkspaceCards = await this.cardRepo.getCardsByWorkspace(ctx.workspaceId);
    const existingGroup = allWorkspaceCards.find(
      c => c.type === "group" && c.documentGroupFor === source.id
    );

    if (existingGroup) {
      return existingGroup;
    }

    const documentGroup = createCard({
      workspaceId: ctx.workspaceId,
      type: "group",
      title: source.title,
      body: "",
      parentId: source.parentId ?? ctx.parentId ?? undefined,
      sourceRef: source.sourceRef ?? source.id,
      cite: source.cite,
      documentGroupFor: source.id,
    });

    await this.cardRepo.saveCard(documentGroup);

    if (source.parentId !== documentGroup.id) {
      const updatedSource = { ...source, parentId: documentGroup.id };
      await this.cardRepo.saveCard(updatedSource);
    }

    return documentGroup;
  }

  private materialize(
    nodes: MarkdownNode[],
    parentId: string | undefined,
    source: Card,
    sourceRef: string,
    workspaceId: string,
    out: Card[]
  ): void {
    for (const node of nodes) {
      if (node.children.length === 0) {
        out.push(createCard({
          workspaceId,
          type: "chunk",
          title: node.title,
          body: node.body,
          sourceRef,
          cite: source.cite,
          parentId,
        }));
        continue;
      }

      const group = createCard({
        workspaceId,
        type: "group",
        title: node.title,
        body: "",
        sourceRef,
        cite: source.cite,
        parentId,
      });
      out.push(group);

      const lead = stripLeadingHeading(node.body);
      if (lead.length > 0) {
        out.push(createCard({
          workspaceId,
          type: "chunk",
          title: `${node.title} · Overview`,
          body: lead,
          sourceRef,
          cite: source.cite,
          parentId: group.id,
        }));
      }

      this.materialize(node.children, group.id, source, sourceRef, workspaceId, out);
    }
  }
}

function stripLeadingHeading(body: string): string {
  return body.replace(/^\s*#{1,6}\s.*(?:\r?\n|$)/, "").trim();
}
