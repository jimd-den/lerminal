import { Logger, silentLogger } from "../ports/Logger";
import { CardRepository } from "../ports/repositories/CardRepository";
import { AgentGateway } from "../ports/gateways/AgentGateway";
import { Card, createCard } from "../../entities/card";
import { createProvenance } from "../../entities/provenance";
import { resolveAssistantProfile, resolveProfileModel } from "../../entities/assistantProfile";
import { chunkCard } from "../../entities/chunking";
import { MarkdownChunkerService, MarkdownNode } from "../card/MarkdownChunkerService";
import { EmptySelectionError } from "../errors";
import { CommandContext, CommandResult, PipelineCommand } from "./Command";

/**
 * Default AI instruction for semantic restructuring (formatting-free — the
 * `chunks-v1` output contract is appended by the gateway, not embedded here).
 */
const DEFAULT_AI_CHUNK_SYSTEM_PROMPT = `You are a collaborative information architect.
Your task is to semantically restructure the provided material into distinct, high-value study chunk cards according to the user's specific learning goal or instruction.

Each chunk must:
- Cover one coherent concept or actionable topic unit.
- Be strictly grounded in the supplied source material without inventing facts.
- Include a specific descriptive title (max 8 words).
- Provide a clear, self-contained body explanation.
- Identify its exact source card ID ("sourceCardId") and supporting source quote ("sourceExcerpt").`;

/**
 * # ChunkCommand (`chunk`) — AI-Assisted Semantic Chunking
 *
 * ## Business Value & Purpose
 * `chunk` semantically restructures selected material (sources, notes, chunks) according to a
 * user's learning goal. When multiple cards are selected, it performs focused AI semantic chunking
 * per card and places each card's focused chunks inside its dedicated Document Container Group.
 *
 * - `chunk "goal"`: Runs AI-assisted semantic chunking with the specified goal.
 * - `chunk`: Uses default semantic goal ("Chunk into key study concepts").
 * - `chunk --faithful` or `chunk -f`: Runs deterministic structural splitting.
 * - Fallback: If no API key is provided or AI call fails, gracefully falls back to structural splitting.
 *
 * ## Applied Design Patterns
 * - **Command Pattern**: Encapsulates AI-assisted semantic chunking in a pipeline stage.
 * - **Container / Aggregate Root Pattern**: Wraps source and derived chunks inside a document group.
 */
export class ChunkCommand implements PipelineCommand {
  readonly name = "chunk";

  constructor(
    private readonly agentGateway: AgentGateway,
    private readonly cardRepo: CardRepository,
    private readonly logger: Logger = silentLogger
  ) {}

  async execute(arg: string, ctx: CommandContext): Promise<CommandResult> {
    const logTimestamp = new Date().toISOString();

    const chunkable = ctx.inputCards.filter(
      c => c.type === "source" || c.type === "note" || c.type === "chunk"
    );
    if (chunkable.length === 0) {
      throw new EmptySelectionError("Select source, note, or chunk to chunk");
    }

    const trimmedArg = arg.trim();
    const isFaithful = /(^|\s)--?(faithful|f)\b/.test(trimmedArg);

    // Path 1: Explicit --faithful flag or missing API key -> deterministic structural split
    if (isFaithful || !ctx.apiKey?.trim()) {
      return this.executeFaithfulSplit(chunkable, ctx);
    }

    const goal = trimmedArg.replace(/(^|\s)--?(faithful|f)\b/g, "").trim() || "Chunk the material into clear, self-contained study units.";
    const profile = resolveAssistantProfile(
      "chunk-document",
      ctx.activeProfileIds,
      ctx.assistantProfiles,
      undefined
    );
    // A persona pinned to its own model speaks through that one; everything else follows
    // the app's current selection, exactly as before personas could carry a model.
    const model = resolveProfileModel(profile, ctx.model);
    const settingsInstruction = ctx.chunkSystemPrompt?.trim();
    const systemPrompt = [
      profile.systemPrompt || DEFAULT_AI_CHUNK_SYSTEM_PROMPT,
      settingsInstruction
        ? `USER-CONFIGURED CHUNK INSTRUCTION (this has priority for content, depth, and style):\n${settingsInstruction}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const created: Card[] = [];

    for (const source of chunkable) {
      let responseCards: any[] = [];
      let usedLocalFallback = false;
      try {
        const result = await this.agentGateway.ask(
          goal,
          [source],
          ctx.apiKey,
          model,
          systemPrompt,
          profile.outputContract ?? "chunks-v1"
        );
        responseCards = result.cards;
        usedLocalFallback = result.isLocalFallback;
      } catch (err: any) {
        // The user still gets chunks, but from a structural split rather than the model —
        // worth recording, because silently degraded output is easy to misread as normal.
        this.logger.warn("chunk.aiFailed.fallbackToSplit", {
          source: source.title,
          reason: err?.message,
        });
        const fallbackResult = await this.executeFaithfulSplit([source], ctx);
        if (fallbackResult.kind === "cards") {
          created.push(...fallbackResult.cards);
        }
        continue;
      }

      if (!Array.isArray(responseCards) || responseCards.length === 0) {
        const fallbackResult = await this.executeFaithfulSplit([source], ctx);
        if (fallbackResult.kind === "cards") {
          created.push(...fallbackResult.cards);
        }
        continue;
      }

      const docGroup = await this.ensureDocumentGroup(source, ctx);
      const fallbackSourceId = source.id;
      const fallbackCite = source.cite;

      const sourceChunks = responseCards
        .filter(item => item && typeof item.title === "string" && typeof item.body === "string" && item.body.trim())
        .map(item =>
          createCard({
            workspaceId: ctx.workspaceId,
            type: "chunk",
            title: item.title.trim(),
            body: item.body.trim(),
            sourceRef: item.sourceCardId?.trim() || fallbackSourceId,
            cite: item.sourceExcerpt?.trim() || fallbackCite,
            parentId: docGroup.id,
            provenance: createProvenance({
              mode: "agent",
              sourceCardIds: [source.id],
              assistantProfileId: profile.id,
              model,
              isLocalFallback: usedLocalFallback || undefined,
            }),
          })
        );

      if (sourceChunks.length === 0) {
        const fallbackResult = await this.executeFaithfulSplit([source], ctx);
        if (fallbackResult.kind === "cards") {
          created.push(...fallbackResult.cards);
        }
        continue;
      }

      created.push(...sourceChunks);
    }

    if (created.length === 0) {
      throw new EmptySelectionError("Nothing to chunk");
    }

    await this.cardRepo.saveCards(created);
    this.logger.debug("chunk.completed", {
      created: created.length,
      sources: chunkable.length,
    });

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

  private async executeFaithfulSplit(chunkable: Card[], ctx: CommandContext): Promise<CommandResult> {
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
      this.materializeTree(tree, docGroup.id, source, sourceRef, ctx.workspaceId, created);
    }

    if (created.length === 0) {
      throw new EmptySelectionError("Nothing to chunk");
    }

    await this.cardRepo.saveCards(created);
    return { kind: "cards", cards: created };
  }

  private materializeTree(
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

      this.materializeTree(node.children, group.id, source, sourceRef, workspaceId, out);
    }
  }
}

function stripLeadingHeading(body: string): string {
  return body.replace(/^\s*#{1,6}\s.*(?:\r?\n|$)/, "").trim();
}
