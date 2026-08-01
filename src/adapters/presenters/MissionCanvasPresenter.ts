import { SemanticRole } from "../../entities/card";
import { GapReport } from "../../usecases/report/GapReportInteractor";

/**
 * # Mission Canvas Presenter
 *
 * ## Business Value & Purpose
 * The top-of-canvas mission readout: what you're building, and the three or four numbers
 * that actually tell you where you stand. It exists to make the canvas feel like a
 * workstation rather than a card bucket.
 *
 * ## Every number here is counted, not estimated
 * The counters come straight from the deterministic `GapReport`, which reads the cards
 * that exist. There is no progress percentage, no readiness score, no synthetic activity —
 * a number on this screen is always something you could verify by counting cards yourself.
 * That constraint is the whole point: a mission console that invents telemetry to look
 * busy is exactly the thing this app is built to not be.
 *
 * ## Semantic tokens, not colours
 * Roles map to *meaning* tokens (`caution`, `evidence`, `accent`, `neutral`) which the
 * theme resolves. Choosing hex here would let a custom accent silently repaint a blocker
 * as an ordinary card, which is the one thing appearance customisation must never do.
 */

/** What a rail or label *means*, resolved to a colour by the theme. */
export type SemanticTone = "accent" | "caution" | "evidence" | "neutral" | "positive";

export interface MissionCounter {
  /** Short label under the number, e.g. "Blockers". */
  label: string;
  value: number;
  tone: SemanticTone;
}

export interface MissionNextAction {
  label: string;
  /** Why this is the recommendation — never shown without one. */
  reason: string;
  presetId?: string;
}

export interface MissionCanvasViewModel {
  hasMission: boolean;
  /** Mission title, or the prompt to define one. */
  title: string;
  /** One line on the target deliverable. Empty when none is set. */
  deliverable: string;
  /** Breadcrumb-ish subtitle: "Workspace / <name>". */
  contextLine: string;
  statusLabel: string;
  /** At most four. Fewer when a count would be noise rather than signal. */
  counters: MissionCounter[];
  nextAction: MissionNextAction | null;
  /**
   * The card group the mission's own cards live under, when it was created through the
   * Goal Architect. Null when the mission predates that link or was set by hand — the
   * screen falls back to showing nothing rather than guessing which group is "the
   * mission's".
   */
  groupId: string | null;
}

/** How each semantic role presents itself on the canvas. */
export interface RolePresentation {
  /** The structured label on the card, e.g. `EXPERIMENT`. */
  label: string;
  tone: SemanticTone;
}

const ROLE_PRESENTATION: Record<SemanticRole, RolePresentation> = {
  goal: { label: "GOAL", tone: "accent" },
  // An open question is what's standing between you and progress — the one role that
  // legitimately earns a caution tone rather than borrowing it for emphasis.
  question: { label: "BLOCKER", tone: "caution" },
  concept: { label: "CONCEPT", tone: "neutral" },
  source: { label: "SOURCE", tone: "evidence" },
  experiment: { label: "EXPERIMENT", tone: "accent" },
  claim: { label: "CLAIM", tone: "neutral" },
  task: { label: "TASK", tone: "neutral" },
  deliverable: { label: "DELIVERABLE", tone: "positive" },
};

/** The label and tone for a card's role, or null for a card that has no role. */
export function presentRole(role: SemanticRole | undefined): RolePresentation | null {
  return role ? ROLE_PRESENTATION[role] : null;
}

export function presentMissionCanvas(
  report: GapReport | null,
  workspaceName: string,
  /** From `Workspace.mission.missionGroupId` — the caller resolves it, this only carries it. */
  missionGroupId: string | null = null
): MissionCanvasViewModel {
  const contextLine = workspaceName ? `Workspace / ${workspaceName}` : "Workspace";

  if (!report || !report.hasMission) {
    return {
      hasMission: false,
      title: "Define what you're working toward",
      deliverable: "",
      contextLine,
      statusLabel: "NO MISSION",
      // No mission means no meaningful counters. Showing zeroes would imply the work
      // exists and is unstarted, rather than that there is nothing to measure yet.
      counters: [],
      nextAction: null,
      groupId: null,
    };
  }

  const { evidence } = report;

  const candidates: MissionCounter[] = [
    { label: "Blockers", value: report.blockers.length, tone: "caution" },
    { label: "Evidence", value: evidence.sources, tone: "evidence" },
    { label: "Next tasks", value: evidence.tasks, tone: "neutral" },
    { label: "Prerequisites", value: evidence.concepts, tone: "neutral" },
  ];

  const recommended = report.recommendedActions[0];

  return {
    hasMission: true,
    title: report.missionTitle ?? "Untitled mission",
    deliverable: report.missionDeliverable ?? "",
    contextLine,
    statusLabel: "ACTIVE",
    // Capped at three: a row of four numbers on a phone reads as a dashboard, and the
    // spec's ceiling is four. Blockers and evidence always earn their place.
    counters: candidates.slice(0, 3),
    nextAction: recommended
      ? {
          label: recommended.label,
          reason: recommended.reason,
          presetId: recommended.presetId,
        }
      : null,
    groupId: missionGroupId,
  };
}

/** Formats a counter as the mockup's zero-padded readout. */
export function formatCounter(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}
