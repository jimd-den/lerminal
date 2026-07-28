import { SearchResult } from "../adapters/gateways/SearchGateway";

/**
 * # Research Result Entity
 *
 * ## Business Value & Purpose
 * Turns a raw `SearchGateway` hit into an inspectable source candidate: what it is
 * (evidence kind), how relevant it looks to the query (a plain-language label, never an
 * invented numeric score), what to be cautious about, and whether the user has kept,
 * rejected, or extracted it. All labels here are explicitly heuristic and explainable —
 * see {@link classifyEvidenceKind} and {@link assessRelevance} — never presented as
 * ground truth.
 */

/** A coarse, explainable classification of what kind of source a domain looks like. */
export type EvidenceKind = "official-docs" | "academic" | "reference" | "tutorial" | "forum" | "unknown";

/** Plain-language relevance label — heuristic, never a fabricated precise score. */
export type RelevanceLabel = "High relevance" | "Possibly relevant" | "Low relevance";

/** Whether the user has acted on this candidate. */
export type ResearchKeepState = "undecided" | "kept" | "rejected";

export interface ResearchResult {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  query: string;
  /** Epoch ms when this result was fetched. */
  accessedAt: number;
  /** 1-based position in the search results as returned. */
  rank: number;
  evidenceKind: EvidenceKind;
  relevance: RelevanceLabel;
  /** Plain-language cautions, e.g. "Tutorial — verify against official documentation". */
  cautions: string[];
  keepState: ResearchKeepState;
  /** Extracted full text, present only after a successful explicit extraction. */
  extractedText?: string;
}

/** Human-readable label for an {@link EvidenceKind}, matching the spec's example phrasing. */
export function evidenceKindLabel(kind: EvidenceKind): string {
  switch (kind) {
    case "official-docs":
      return "Official documentation";
    case "academic":
      return "Academic / research source";
    case "reference":
      return "Reference (encyclopedia-style)";
    case "tutorial":
      return "Tutorial; verify against specification";
    case "forum":
      return "Community forum; not authoritative";
    case "unknown":
      return "Limited provenance";
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Explainable, deterministic domain classification — no opaque scoring. */
export function classifyEvidenceKind(url: string): EvidenceKind {
  const domain = extractDomain(url).toLowerCase();
  if (
    domain.endsWith(".gov") ||
    domain.endsWith(".edu") ||
    domain.includes("arxiv.org") ||
    domain.includes("ncbi.nlm.nih.gov") ||
    domain.includes("nature.com") ||
    domain.includes("acm.org") ||
    domain.includes("ieee.org")
  ) {
    return "academic";
  }
  if (domain.includes("wikipedia.org")) return "reference";
  if (
    domain.startsWith("docs.") ||
    domain.startsWith("developer.") ||
    domain.includes("readthedocs.io") ||
    domain.includes("github.com") ||
    domain.includes("mdn")
  ) {
    return "official-docs";
  }
  if (domain.includes("stackoverflow.com") || domain.includes("reddit.com") || domain.includes("forum")) {
    return "forum";
  }
  if (domain.includes("medium.com") || domain.includes("blog") || domain.includes("tutorial")) {
    return "tutorial";
  }
  return "unknown";
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

/**
 * Explainable keyword-overlap heuristic between the query and the result's title+snippet.
 * Never presented as a precise score — only the coarse label is surfaced to the user.
 */
export function assessRelevance(query: string, title: string, snippet: string): RelevanceLabel {
  const queryWords = new Set(tokenize(query));
  if (queryWords.size === 0) return "Possibly relevant";
  const resultWords = new Set(tokenize(`${title} ${snippet}`));
  let overlap = 0;
  for (const word of queryWords) {
    if (resultWords.has(word)) overlap += 1;
  }
  const ratio = overlap / queryWords.size;
  if (ratio >= 0.6) return "High relevance";
  if (ratio >= 0.25) return "Possibly relevant";
  return "Low relevance";
}

function buildCautions(kind: EvidenceKind, isDuplicateDomain: boolean): string[] {
  const cautions: string[] = [];
  if (kind === "tutorial") cautions.push("Tutorial — verify against official documentation");
  if (kind === "forum") cautions.push("Community discussion — not authoritative");
  if (kind === "unknown") cautions.push("Limited provenance signals for this domain");
  if (isDuplicateDomain) cautions.push("Same domain as an earlier result in this list");
  return cautions;
}

/**
 * Normalizes raw `SearchGateway` results into inspectable {@link ResearchResult}
 * candidates: classifies evidence kind, assesses relevance against the query, flags
 * same-domain duplicates, and defaults every candidate to `keepState: "undecided"` —
 * nothing is retained or used for synthesis until the user explicitly keeps it.
 */
export function normalizeSearchResults(
  raw: SearchResult[],
  query: string,
  now: number = Date.now()
): ResearchResult[] {
  const seenDomains = new Set<string>();
  return raw.map((result, index) => {
    const domain = extractDomain(result.url);
    const isDuplicateDomain = seenDomains.has(domain);
    seenDomains.add(domain);
    const evidenceKind = classifyEvidenceKind(result.url);
    return {
      title: result.title,
      url: result.url,
      snippet: result.snippet,
      domain,
      query,
      accessedAt: now,
      rank: index + 1,
      evidenceKind,
      relevance: assessRelevance(query, result.title, result.snippet),
      cautions: buildCautions(evidenceKind, isDuplicateDomain),
      keepState: "undecided",
    };
  });
}
