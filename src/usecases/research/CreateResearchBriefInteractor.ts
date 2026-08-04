import { Card, createCard } from "../../entities/card";
import { createProvenance } from "../../entities/provenance";
import { ResearchResult } from "../../entities/research";
import { BUILTIN_ASSISTANT_PROFILES } from "../../entities/assistantProfile";
import { AgentGateway } from "../ports/gateways/AgentGateway";
import { CardRepository } from "../ports/repositories/CardRepository";
import { AgentRequestError, EmptySelectionError, MissingApiKeyError, UngroundedBriefError } from "../errors";

const RESEARCH_BRIEF_PROFILE = BUILTIN_ASSISTANT_PROFILES.find(p => p.id === "builtin-research-brief")!;

export interface CreateResearchBriefRequest {
  query: string;
  results: ResearchResult[];
  workspaceId: string;
  parentId: string | null;
  apiKey: string;
  model: string;
}

/**
 * # Create Research Brief Interactor
 *
 * ## Business Value & Purpose
 * "Create cited brief" — the one step in the research workflow allowed to call the
 * model. It only ever sees results the user has explicitly kept, encodes each as a
 * synthetic source card carrying its URL, and requires the model to cite the exact
 * source card + excerpt for every claim via the `chunks-v1` contract. Two honesty
 * guards enforce "fail clearly rather than fabricate":
 *
 * 1. Requires a configured API key up front — never silently proceeds to whatever a
 *    gateway's own local-fallback path might return.
 * 2. Drops (and, if nothing survives, rejects the whole run) any response card that
 *    doesn't cite one of the retained source cards — a same-shaped-but-uncited response
 *    is exactly what a generic local-fallback template looks like, so this is also a
 *    practical backstop against that failure mode without touching the gateway itself.
 */
export class CreateResearchBriefInteractor {
  constructor(
    private readonly agentGateway: AgentGateway,
    private readonly cardRepo: CardRepository
  ) {}

  async execute(request: CreateResearchBriefRequest): Promise<Card[]> {
    if (!request.apiKey?.trim()) {
      throw new MissingApiKeyError("Creating a cited research brief");
    }

    const retained = request.results.filter(r => r.keepState === "kept");
    if (retained.length === 0) {
      throw new EmptySelectionError("Keep at least one source before creating a brief");
    }

    const sourceCards: Card[] = retained.map(r =>
      createCard({
        workspaceId: request.workspaceId,
        type: "source",
        title: r.title,
        body: `Source URL: ${r.url}\n\n${r.extractedText ?? r.snippet}`,
        cite: r.url,
      })
    );

    const askResult = await this.agentGateway.ask(
      request.query,
      sourceCards,
      request.apiKey,
      request.model,
      RESEARCH_BRIEF_PROFILE.systemPrompt,
      "chunks-v1"
    );

    // A brief is a claim about evidence. Template text has read no evidence at all, so
    // it is refused outright rather than saved with a caveat.
    if (askResult.isLocalFallback) {
      throw new AgentRequestError(
        askResult.fallbackReason ?? "No model answered, so no cited brief was written"
      );
    }
    const agentCards = askResult.cards;

    const sourceCardById = new Map(sourceCards.map(c => [c.id, c]));
    const grounded = agentCards.filter(item => item.sourceCardId && sourceCardById.has(item.sourceCardId));

    if (grounded.length === 0) {
      throw new UngroundedBriefError();
    }

    const briefCards = grounded.map(item => {
      const sourceCard = sourceCardById.get(item.sourceCardId!)!;
      const retainedResult = retained.find(r => r.url === sourceCard.cite);
      return createCard({
        workspaceId: request.workspaceId,
        type: "chunk",
        role: "claim",
        title: item.title,
        body: item.body,
        cite: retainedResult?.url,
        parentId: request.parentId ?? undefined,
        references: item.references,
        sourceRef: sourceCard.id,
        provenance: createProvenance({
          mode: "search",
          searchQuery: request.query,
          sourceUrls: retainedResult ? [retainedResult.url] : [],
          model: request.model,
          citations: item.sourceExcerpt
            ? [{ excerpt: item.sourceExcerpt, url: retainedResult?.url }]
            : undefined,
        }),
      });
    });

    await this.cardRepo.saveCards(briefCards);
    return briefCards;
  }
}
