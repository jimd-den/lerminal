import { CardRepository } from "../../adapters/repositories/CardRepository";
import { AgentGateway } from "../../adapters/gateways/AgentGateway";
import { Card, createCard } from "../../entities/card";
import { chunkCard } from "../commands";
import { MarkdownChunkerService, MarkdownNode } from "../card/MarkdownChunkerService";
import { EmptySelectionError } from "../errors";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/** System prompt used only by the opt-in `--rewrite` refinement pass. */
const REFINE_SYSTEM_PROMPT = `You rewrite a single passage into one clear, faithful study card WITHOUT adding facts that are not in the passage. Respond ONLY with a valid JSON array containing EXACTLY ONE object (no prose, no code fences) with:
- "title": string (max 8 words)
- "body": string (a faithful, tightened explanation of the passage)`;

/**
 * `chunk` — splits selected source/note/chunk cards into cards that mirror the
 * source's own structure.
 *
 * Default behavior is **faithful and deterministic**: it parses the card's markdown
 * into its real heading hierarchy (chapters → subheadings via H1–H3) and creates a
 * `group` per heading-with-subsections and a `chunk` per leaf section, each anchored
 * to the origin via `sourceRef`/`cite`. Text without headings falls back to
 * paragraph-level chunking. No API key is required.
 *
 * The `--rewrite` flag opts into an LLM refinement pass that tightens each leaf
 * chunk's wording without inventing new facts (requires an API key).
 */
export class ChunkCommand implements PipelineCommand {
  readonly name = "chunk";

  constructor(
    private readonly agentGateway: AgentGateway,
    private readonly cardRepo: CardRepository
  ) {}

  async execute(arg: string, ctx: CommandContext): Promise<CommandResult> {
    const chunkable = ctx.inputCards.filter(
      c => c.type === "source" || c.type === "note" || c.type === "chunk"
    );
    if (chunkable.length === 0) {
      throw new EmptySelectionError("Select source or note to chunk");
    }

    const rewrite = /(^|\s)--?rewrite\b/.test(arg);
    const created: Card[] = [];

    for (const card of chunkable) {
      const sourceRef = card.sourceRef || card.id;
      const sections = MarkdownChunkerService.chunk(card.body, card.title);

      if (sections.length <= 1) {
        // No real heading structure — chunk by paragraph (faithful to the text).
        const generated = chunkCard(card).map(c => ({ ...c, parentId: ctx.parentId ?? undefined }));
        created.push(...generated);
        continue;
      }

      const tree = MarkdownChunkerService.chunkTree(card.body, card.title);
      this.materialize(tree, ctx.parentId ?? undefined, card, sourceRef, ctx.workspaceId, created);
    }

    if (created.length === 0) {
      throw new EmptySelectionError("Nothing to chunk");
    }

    if (rewrite && ctx.apiKey?.trim()) {
      await this.refineLeaves(created, ctx);
    }

    await this.cardRepo.saveCards(created);
    return { kind: "cards", cards: created };
  }

  /**
   * Walks the heading tree, emitting a `group` card for each node with subsections
   * (recursing into its children) and a `chunk` card for each leaf. A parent node's
   * own lead-in text (between its heading and the first subheading) becomes an
   * `Overview` chunk so no source content is dropped.
   */
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

  /**
   * Opt-in refinement: tightens each leaf chunk's body via the agent without adding
   * facts. Failures are swallowed per-card so a partial outage never loses the
   * faithfully-chunked content.
   */
  private async refineLeaves(cards: Card[], ctx: CommandContext): Promise<void> {
    for (const card of cards) {
      if (card.type !== "chunk") continue;
      try {
        const [refined] = await this.agentGateway.ask(
          "Rewrite the provided passage faithfully.",
          [card],
          ctx.apiKey,
          ctx.model,
          REFINE_SYSTEM_PROMPT
        );
        if (refined?.body?.trim()) {
          card.body = refined.body;
          if (refined.title?.trim()) card.title = refined.title;
        }
      } catch (err: any) {
        // Keep the faithful original on refinement failure.
        console.warn(`[ChunkCommand.refineLeaves] skipped ${card.id}: ${err?.message}`);
      }
    }
  }
}

/**
 * Removes a single leading markdown heading line from a section body, returning the
 * remaining lead-in prose (trimmed). Used to surface a parent section's own content
 * as an Overview chunk without repeating its heading.
 */
function stripLeadingHeading(body: string): string {
  return body.replace(/^\s*#{1,6}\s.*(?:\r?\n|$)/, "").trim();
}
