import { Card, SemanticRole } from "../../entities/card";
import { Workspace } from "../../entities/workspace";

/**
 * # Gap Report Interactor
 *
 * ## Business Value & Purpose
 * Answers, deterministically and without ever calling a model, "what do I have, what do
 * I want, what is missing, and what should I do next?" Every count and label here is
 * computed directly from the card graph and the workspace mission — nothing is invented,
 * nothing requires an API key. Optional agent enrichment (Phase 4's "Enrich with AI") is
 * a separate, explicitly-scoped step layered on top by the UI, never blended into this
 * report silently.
 */

export type MaturityLevel = "just-starting" | "building-evidence" | "developing" | "near-complete";

const MATURITY_LABELS: Record<MaturityLevel, string> = {
  "just-starting": "Just starting — little evidence gathered yet",
  "building-evidence": "Building evidence — early progress",
  developing: "Developing — meaningful progress, gaps remain",
  "near-complete": "Near complete — most success criteria have evidence",
};

export interface GapReportEvidenceCounts {
  sources: number;
  concepts: number;
  claims: number;
  experiments: number;
  tasks: number;
  deliverables: number;
  openQuestions: number;
}

export interface SuccessCriterionStatus {
  text: string;
  hasEvidence: boolean;
}

export interface GapReportNextAction {
  label: string;
  reason: string;
  /** Operation preset id the UI can launch directly for this action, if applicable. */
  presetId?: string;
}

export interface GapReport {
  workspaceId: string;
  generatedAt: number;
  hasMission: boolean;
  missionTitle?: string;
  missionDeliverable?: string;
  successCriteria: SuccessCriterionStatus[];
  evidence: GapReportEvidenceCounts;
  /** Open question cards, capped for display. */
  blockers: { id: string; title: string }[];
  /** Plain-language gap statements — not scored, just stated. */
  evidenceGaps: string[];
  recommendedActions: GapReportNextAction[];
  maturity: MaturityLevel;
  /** Human-readable, explicitly labeled as heuristic — never presented as a precise measurement. */
  maturityLabel: string;
}

const EMPTY_COUNTS: GapReportEvidenceCounts = {
  sources: 0,
  concepts: 0,
  claims: 0,
  experiments: 0,
  tasks: 0,
  deliverables: 0,
  openQuestions: 0,
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);
}

/** True when a card's title/body shares a meaningful word with the criterion text. */
function cardMatchesCriterion(card: Card, criterionWords: Set<string>): boolean {
  const cardWords = tokenize(`${card.title} ${card.body}`);
  return cardWords.some(w => criterionWords.has(w));
}

/** Classifies a card into a report bucket: explicit `role` first, falling back to `type` for legacy cards. */
function classify(card: Card): keyof GapReportEvidenceCounts | null {
  const role: SemanticRole | undefined = card.role;
  if (role === "source") return "sources";
  if (role === "concept") return "concepts";
  if (role === "claim") return "claims";
  if (role === "experiment") return "experiments";
  if (role === "task") return "tasks";
  if (role === "deliverable") return "deliverables";
  if (role === "question") return "openQuestions";

  // Legacy fallback for cards created before semantic roles existed.
  if (card.type === "source") return "sources";
  if (card.type === "chunk" || card.type === "note") return "concepts";
  if (card.type === "question" && !card.schedule) return "openQuestions";
  return null;
}

/**
 * Serializes a deterministic {@link GapReport} into a compact prompt for the optional
 * "Enrich with AI" step (the `status-report` operation preset). Carries only the facts
 * already computed here — the model is asked to add one qualitative read, not recompute
 * or contradict them.
 */
export function summarizeGapReportForPrompt(report: GapReport): string {
  const lines: string[] = [];
  lines.push(report.hasMission ? `Mission: ${report.missionTitle}` : "Mission: not yet defined");
  if (report.missionDeliverable) lines.push(`Target deliverable: ${report.missionDeliverable}`);
  lines.push(
    `Evidence: ${report.evidence.sources} sources, ${report.evidence.concepts} concepts, ${report.evidence.claims} claims, ${report.evidence.experiments} experiments, ${report.evidence.tasks} tasks, ${report.evidence.deliverables} deliverables, ${report.evidence.openQuestions} open questions.`
  );
  if (report.evidenceGaps.length > 0) lines.push(`Gaps: ${report.evidenceGaps.join(" ")}`);
  lines.push(report.maturityLabel);
  lines.push("Assess momentum and suggest the single most useful next move based only on the above.");
  return lines.join("\n");
}

export class GapReportInteractor {
  execute(workspace: Workspace, cards: Card[], now: number = Date.now()): GapReport {
    const evidence: GapReportEvidenceCounts = { ...EMPTY_COUNTS };
    const blockerCards: Card[] = [];

    for (const card of cards) {
      const bucket = classify(card);
      if (!bucket) continue;
      evidence[bucket] += 1;
      if (bucket === "openQuestions") blockerCards.push(card);
    }

    const mission = workspace.mission;
    const successCriteria: SuccessCriterionStatus[] = (mission?.successCriteria ?? []).map(text => {
      const words = new Set(tokenize(text));
      const hasEvidence = words.size > 0 && cards.some(card => cardMatchesCriterion(card, words));
      return { text, hasEvidence };
    });

    const evidenceGaps = this.buildEvidenceGaps(evidence, mission !== undefined);
    const recommendedActions = this.buildRecommendedActions(evidence, successCriteria, mission !== undefined);
    const { maturity, maturityLabel } = this.assessMaturity(evidence, successCriteria);

    return {
      workspaceId: workspace.id,
      generatedAt: now,
      hasMission: mission !== undefined,
      missionTitle: mission?.goalTitle,
      missionDeliverable: mission?.targetDeliverable,
      successCriteria,
      evidence,
      blockers: blockerCards.slice(0, 8).map(c => ({ id: c.id, title: c.title })),
      evidenceGaps,
      recommendedActions,
      maturity,
      maturityLabel,
    };
  }

  private buildEvidenceGaps(evidence: GapReportEvidenceCounts, hasMission: boolean): string[] {
    const gaps: string[] = [];
    if (!hasMission) gaps.push("No mission defined yet — the report can't judge progress toward a goal.");
    if (evidence.sources === 0) gaps.push("No sources captured yet.");
    if (evidence.claims === 0) gaps.push("No web-grounded claims yet.");
    if (evidence.experiments === 0) gaps.push("No experiments planned or run yet.");
    if (evidence.openQuestions > 0) {
      gaps.push(`${evidence.openQuestions} open question${evidence.openQuestions === 1 ? "" : "s"} unresolved.`);
    }
    if (evidence.deliverables === 0 && hasMission) gaps.push("No deliverable/milestone cards yet.");
    return gaps;
  }

  private buildRecommendedActions(
    evidence: GapReportEvidenceCounts,
    successCriteria: SuccessCriterionStatus[],
    hasMission: boolean
  ): GapReportNextAction[] {
    const actions: GapReportNextAction[] = [];

    if (!hasMission) {
      actions.push({ label: "Define a mission", reason: "Set a goal so progress can be tracked against it." });
    }
    if (evidence.sources === 0) {
      actions.push({
        label: "Research the web for source material",
        reason: "No sources captured yet.",
        presetId: "research-web",
      });
    }
    const uncoveredCriteria = successCriteria.filter(c => !c.hasEvidence);
    if (uncoveredCriteria.length > 0) {
      actions.push({
        label: "Find prerequisites for the uncovered success criteria",
        reason: `${uncoveredCriteria.length} success criterion/criteria have no matching evidence yet.`,
        presetId: "find-prerequisites",
      });
    }
    if (evidence.concepts > 0 && evidence.openQuestions === 0) {
      actions.push({
        label: "Make study cards from what you have",
        reason: "There's material to study but no active-recall questions yet.",
        presetId: "make-study-cards",
      });
    }
    if (evidence.experiments === 0 && hasMission) {
      actions.push({
        label: "Plan an experiment",
        reason: "No experiments planned yet.",
        presetId: "plan-experiment",
      });
    }
    if (hasMission && evidence.deliverables === 0) {
      actions.push({
        label: "Plan capstone milestones",
        reason: "No milestone/deliverable cards yet.",
        presetId: "plan-capstone",
      });
    }

    return actions.slice(0, 4);
  }

  private assessMaturity(
    evidence: GapReportEvidenceCounts,
    successCriteria: SuccessCriterionStatus[]
  ): { maturity: MaturityLevel; maturityLabel: string } {
    const evidenceTotal =
      evidence.sources + evidence.concepts + evidence.claims + evidence.experiments + evidence.tasks + evidence.deliverables;

    const coverageRatio =
      successCriteria.length > 0
        ? successCriteria.filter(c => c.hasEvidence).length / successCriteria.length
        : Math.min(1, evidenceTotal / 8);

    let maturity: MaturityLevel;
    if (evidenceTotal === 0) {
      maturity = "just-starting";
    } else if (evidence.deliverables > 0 || coverageRatio >= 0.75) {
      maturity = "near-complete";
    } else if (coverageRatio >= 0.34) {
      maturity = "developing";
    } else {
      maturity = "building-evidence";
    }

    return { maturity, maturityLabel: `Heuristic read: ${MATURITY_LABELS[maturity]}. Not a precise measurement.` };
  }
}
