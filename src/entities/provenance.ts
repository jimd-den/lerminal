/**
 * # Provenance Entity
 *
 * ## Business Value & Purpose
 * A learner must be able to tell whether a card is something they wrote, something an
 * agent produced from their own notes, something pulled from the open web, or the
 * product of a deterministic command (chunk/split/recall/etc.). `Provenance` is the
 * compact, persistable record of how a single card came to exist, attached optionally
 * to `Card.provenance` (see `card.ts`). Cards created before this feature existed simply
 * have no provenance — callers must treat `undefined` as "not recorded," never fabricate one.
 */

/** How a card was produced. */
export type CreationMode = "manual" | "agent" | "search" | "extraction" | "command";

/** A citation linking part of a card's content back to supporting material. */
export interface ProvenanceCitation {
  /** The supporting excerpt/quote. */
  excerpt: string;
  /** The source card this excerpt was drawn from, if any. */
  sourceCardId?: string;
  /** The URL this excerpt was drawn from, if any. */
  url?: string;
}

export interface Provenance {
  /** How this card was produced. */
  mode: CreationMode;
  /** The {@link OperationRecord} id that produced this card, if any (see `operationLog.ts`). */
  operationId?: string;
  /** Ids of cards read as context to produce this card. */
  sourceCardIds?: string[];
  /** The web search query used, if this card came from/through a search. */
  searchQuery?: string;
  /** Source URLs actually used or retained to produce this card. */
  sourceUrls?: string[];
  /** The assistant profile id active when this card was produced, if agent-backed. */
  assistantProfileId?: string;
  /** The model identifier used, if agent-backed. */
  model?: string;
  /** Epoch timestamp of creation. */
  createdAt: number;
  /** Supporting citations, when available. */
  citations?: ProvenanceCitation[];
  /**
   * True when this content came from a local fallback template (e.g. a gateway
   * generating canned cards because no API key was configured or the request failed)
   * rather than a genuine model response. Must never be left unset when a fallback
   * path produced the content — see `OpenRouterAgentGateway.generateLocalFallback`.
   */
  isLocalFallback?: boolean;
}

export interface CreateProvenanceParams {
  mode: CreationMode;
  operationId?: string;
  sourceCardIds?: string[];
  searchQuery?: string;
  sourceUrls?: string[];
  assistantProfileId?: string;
  model?: string;
  citations?: ProvenanceCitation[];
  isLocalFallback?: boolean;
  createdAt?: number;
}

/** Factory for a valid {@link Provenance} record. */
export function createProvenance(params: CreateProvenanceParams): Provenance {
  return {
    mode: params.mode,
    operationId: params.operationId,
    sourceCardIds: params.sourceCardIds,
    searchQuery: params.searchQuery,
    sourceUrls: params.sourceUrls,
    assistantProfileId: params.assistantProfileId,
    model: params.model,
    createdAt: params.createdAt ?? Date.now(),
    citations: params.citations,
    isLocalFallback: params.isLocalFallback,
  };
}
