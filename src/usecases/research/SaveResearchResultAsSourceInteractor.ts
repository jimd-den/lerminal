import { Card, createCard } from "../../entities/card";
import { createProvenance } from "../../entities/provenance";
import { ResearchResult } from "../../entities/research";
import { CardRepository } from "../ports/repositories/CardRepository";

export interface SaveResearchResultAsSourceRequest {
  result: ResearchResult;
  workspaceId: string;
  parentId: string | null;
}

/**
 * # Save Research Result As Source Interactor
 *
 * ## Business Value & Purpose
 * The direct, deterministic "keep this" action for the research workflow: turns a
 * candidate the user has looked at into a real, persisted `source` card immediately —
 * no model call, no API key required. Distinct from "Create cited brief" (which
 * synthesizes `claim` cards from the model and does need a key): a learner must be able
 * to save evidence they found on the web even with no AI configured at all. Uses the
 * candidate's extracted full text when available, falling back to the search snippet,
 * and records honest provenance (`extraction` vs `search`) reflecting which one it was.
 */
export class SaveResearchResultAsSourceInteractor {
  constructor(private readonly cardRepo: CardRepository) {}

  async execute(request: SaveResearchResultAsSourceRequest): Promise<Card> {
    const { result } = request;
    const card = createCard({
      workspaceId: request.workspaceId,
      type: "source",
      role: "source",
      title: result.title,
      body: result.extractedText ?? result.snippet,
      cite: result.url,
      parentId: request.parentId ?? undefined,
      provenance: createProvenance({
        mode: result.extractedText ? "extraction" : "search",
        searchQuery: result.query,
        sourceUrls: [result.url],
      }),
    });

    await this.cardRepo.saveCard(card);
    return card;
  }
}
