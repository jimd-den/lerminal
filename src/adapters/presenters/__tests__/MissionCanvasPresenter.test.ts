import { describe, expect, it } from "bun:test";
import {
  formatCounter,
  presentMissionCanvas,
  presentRole,
} from "../MissionCanvasPresenter";
import { GapReport } from "../../../usecases/report/GapReportInteractor";
import { SEMANTIC_ROLES } from "../../../entities/card";

const report = (overrides: Partial<GapReport> = {}): GapReport => ({
  workspaceId: "w1",
  generatedAt: 0,
  hasMission: true,
  missionTitle: "Build a procedural traversal prototype",
  missionDeliverable: "Validate infinite-room streaming.",
  successCriteria: [],
  evidence: {
    sources: 12,
    concepts: 4,
    claims: 0,
    experiments: 2,
    tasks: 1,
    deliverables: 0,
    openQuestions: 3,
  },
  blockers: [
    { id: "b1", title: "Chunk streaming creates seams" },
    { id: "b2", title: "Frame time" },
    { id: "b3", title: "Memory" },
  ],
  evidenceGaps: [],
  recommendedActions: [
    { label: "Profile CPU splat fallback", reason: "No frame-time baseline exists yet" },
  ],
  maturity: "forming" as GapReport["maturity"],
  maturityLabel: "Forming",
  ...overrides,
});

describe("presentMissionCanvas", () => {
  it("counts what exists rather than estimating progress", () => {
    const view = presentMissionCanvas(report(), "Backrooms engine research");

    expect(view.counters.map(c => [c.label, c.value])).toEqual([
      ["Blockers", 3],
      ["Evidence", 12],
      ["Next tasks", 1],
    ]);
  });

  it("shows at most three counters, so it reads as an instrument not a dashboard", () => {
    expect(presentMissionCanvas(report(), "ws").counters.length).toBeLessThanOrEqual(3);
  });

  it("gives blockers a caution tone and evidence its own", () => {
    const view = presentMissionCanvas(report(), "ws");

    // Neither may resolve to the accent, or a custom accent could repaint them.
    expect(view.counters.find(c => c.label === "Blockers")?.tone).toBe("caution");
    expect(view.counters.find(c => c.label === "Evidence")?.tone).toBe("evidence");
  });

  it("carries the next action's reason, never the label alone", () => {
    const view = presentMissionCanvas(report(), "ws");

    expect(view.nextAction?.label).toBe("Profile CPU splat fallback");
    expect(view.nextAction?.reason.length).toBeGreaterThan(0);
  });

  it("has no next action when the report recommends none", () => {
    const view = presentMissionCanvas(report({ recommendedActions: [] }), "ws");

    expect(view.nextAction).toBeNull();
  });

  it("shows no counters at all when there is no mission", () => {
    const view = presentMissionCanvas(report({ hasMission: false }), "ws");

    // Zeroes would imply the work exists and is unstarted, which is a different claim.
    expect(view.counters).toEqual([]);
    expect(view.hasMission).toBe(false);
    expect(view.statusLabel).toBe("NO MISSION");
  });

  it("prompts for a mission rather than rendering an empty panel", () => {
    const view = presentMissionCanvas(null, "ws");

    expect(view.title).toContain("Define what you're working toward");
  });

  it("names the workspace in the context line", () => {
    expect(presentMissionCanvas(report(), "Backrooms").contextLine).toBe(
      "Workspace / Backrooms",
    );
  });

  it("survives a workspace with no name", () => {
    expect(presentMissionCanvas(report(), "").contextLine).toBe("Workspace");
  });
});

describe("presentRole", () => {
  it("gives every semantic role a label and a tone", () => {
    for (const role of SEMANTIC_ROLES) {
      const presentation = presentRole(role);
      expect(presentation?.label.length).toBeGreaterThan(0);
      expect(presentation?.tone).toBeTruthy();
    }
  });

  it("shows an open question as a blocker, the role that earns a caution tone", () => {
    expect(presentRole("question")).toEqual({ label: "BLOCKER", tone: "caution" });
  });

  it("marks a source as evidence rather than as the accent", () => {
    expect(presentRole("source")?.tone).toBe("evidence");
  });

  it("invents nothing for a card with no role", () => {
    expect(presentRole(undefined)).toBeNull();
  });
});

describe("formatCounter", () => {
  it("zero-pads a single digit for the readout", () => {
    expect(formatCounter(3)).toBe("03");
    expect(formatCounter(0)).toBe("00");
  });

  it("leaves larger numbers alone rather than truncating them", () => {
    expect(formatCounter(12)).toBe("12");
    expect(formatCounter(140)).toBe("140");
  });
});
