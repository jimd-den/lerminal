import { describe, expect, it } from "bun:test";
import { GapReportInteractor } from "../GapReportInteractor";
import { createCard } from "../../../entities/card";
import { createWorkspace, createWorkspaceMission } from "../../../entities/workspace";
import { createInitialSchedule } from "../../../entities/schedule";

const interactor = new GapReportInteractor();

describe("GapReportInteractor", () => {
  it("reports hasMission=false and recommends defining a mission when none is set", () => {
    const ws = createWorkspace({ name: "Untitled" });
    const report = interactor.execute(ws, []);

    expect(report.hasMission).toBe(false);
    expect(report.evidenceGaps).toContain("No mission defined yet — the report can't judge progress toward a goal.");
    expect(report.recommendedActions[0].label).toBe("Define a mission");
  });

  it("counts cards by explicit semantic role first", () => {
    const ws = createWorkspace({ name: "W" });
    const cards = [
      createCard({ workspaceId: ws.id, type: "note", title: "S1", body: "b", role: "source" }),
      createCard({ workspaceId: ws.id, type: "note", title: "C1", body: "b", role: "concept" }),
      createCard({ workspaceId: ws.id, type: "note", title: "Claim1", body: "b", role: "claim" }),
      createCard({ workspaceId: ws.id, type: "question", title: "Exp1", body: "b", role: "experiment" }),
    ];

    const report = interactor.execute(ws, cards);

    expect(report.evidence.sources).toBe(1);
    expect(report.evidence.concepts).toBe(1);
    expect(report.evidence.claims).toBe(1);
    expect(report.evidence.experiments).toBe(1);
  });

  it("falls back to card.type for legacy cards with no role set", () => {
    const ws = createWorkspace({ name: "W" });
    const cards = [
      createCard({ workspaceId: ws.id, type: "source", title: "Legacy source", body: "b" }),
      createCard({ workspaceId: ws.id, type: "chunk", title: "Legacy chunk", body: "b" }),
      createCard({ workspaceId: ws.id, type: "question", title: "Legacy question", body: "b" }),
    ];

    const report = interactor.execute(ws, cards);

    expect(report.evidence.sources).toBe(1);
    expect(report.evidence.concepts).toBe(1);
    expect(report.evidence.openQuestions).toBe(1);
  });

  it("does not count a scheduled (already-in-practice) question card as an open blocker", () => {
    const ws = createWorkspace({ name: "W" });
    const scheduled = createCard({
      workspaceId: ws.id,
      type: "question",
      title: "Scheduled",
      body: "",
      schedule: createInitialSchedule(0),
    });

    const report = interactor.execute(ws, [scheduled]);

    expect(report.evidence.openQuestions).toBe(0);
  });

  it("flags a success criterion as covered only when a card shares a meaningful word with it", () => {
    const mission = createWorkspaceMission({
      goalTitle: "Ship a renderer",
      successCriteria: ["Renders a textured cube", "Runs at 60fps"],
    });
    const ws = createWorkspace({ name: "W", mission });
    const matchingCard = createCard({ workspaceId: ws.id, type: "note", title: "Textured cube demo", body: "Rendering notes", role: "concept" });

    const report = interactor.execute(ws, [matchingCard]);

    expect(report.successCriteria[0].hasEvidence).toBe(true);
    expect(report.successCriteria[1].hasEvidence).toBe(false);
  });

  it("recommends make-study-cards only when there is material but no open questions", () => {
    const ws = createWorkspace({ name: "W" });
    const cards = [createCard({ workspaceId: ws.id, type: "note", title: "Concept", body: "b", role: "concept" })];

    const report = interactor.execute(ws, cards);
    const presetIds = report.recommendedActions.map(a => a.presetId);

    expect(presetIds).toContain("make-study-cards");
  });

  it("assesses maturity as just-starting with zero evidence", () => {
    const mission = createWorkspaceMission({ goalTitle: "Goal", successCriteria: ["Criterion A"] });
    const ws = createWorkspace({ name: "W", mission });

    const report = interactor.execute(ws, []);

    expect(report.maturity).toBe("just-starting");
    expect(report.maturityLabel).toContain("Heuristic");
  });

  it("assesses maturity as near-complete once a deliverable exists", () => {
    const ws = createWorkspace({ name: "W" });
    const cards = [createCard({ workspaceId: ws.id, type: "note", title: "Deliverable", body: "b", role: "deliverable" })];

    const report = interactor.execute(ws, cards);

    expect(report.maturity).toBe("near-complete");
  });

  it("caps blockers and recommended actions to a bounded, display-friendly length", () => {
    const ws = createWorkspace({ name: "W" });
    const manyQuestions = Array.from({ length: 15 }, (_, i) =>
      createCard({ workspaceId: ws.id, type: "question", title: `Q${i}`, body: "" })
    );

    const report = interactor.execute(ws, manyQuestions);

    expect(report.blockers.length).toBeLessThanOrEqual(8);
    expect(report.recommendedActions.length).toBeLessThanOrEqual(4);
  });
});
