import { describe, expect, it } from "bun:test";
import { nextActionsForCard } from "../nextActions";
import { createCard } from "../../../entities/card";

const note = () => createCard({ workspaceId: "w", type: "note", title: "N", body: "B" });

describe("nextActionsForCard", () => {
  it("offers 2-3 suggestions, never an overwhelming menu", () => {
    const roles = ["question", "concept", "source", "experiment", "claim", "task", "deliverable", "goal"] as const;
    for (const role of roles) {
      const card = createCard({ workspaceId: "w", type: "note", title: "T", body: "B", role });
      const actions = nextActionsForCard(card);
      expect(actions.length).toBeGreaterThanOrEqual(2);
      expect(actions.length).toBeLessThanOrEqual(3);
    }
  });

  it("routes every AI-backed suggestion through the preflight, never straight to a gateway", () => {
    const roles = ["question", "concept", "source", "experiment", "claim", "task", "deliverable", "goal"] as const;
    for (const role of roles) {
      const card = createCard({ workspaceId: "w", type: "note", title: "T", body: "B", role });
      for (const action of nextActionsForCard(card)) {
        expect(["preflight", "pipeline", "mission"]).toContain(action.dispatch.kind);
      }
    }
  });

  it("suggests source-specific follow-ups for a source card", () => {
    const card = createCard({ workspaceId: "w", type: "source", title: "S", body: "B" });

    const ids = nextActionsForCard(card).map(a => a.id);

    expect(ids).toContain("extract-ideas");
    expect(ids).toContain("study-cards");
  });

  it("suggests experiment-specific follow-ups for an experiment card", () => {
    const card = createCard({ workspaceId: "w", type: "note", title: "E", body: "B", role: "experiment" });

    const ids = nextActionsForCard(card).map(a => a.id);

    expect(ids).toContain("plan-experiment");
    expect(ids).toContain("create-task");
  });

  it("prefers the explicit semantic role over the legacy card type", () => {
    const card = createCard({ workspaceId: "w", type: "source", title: "T", body: "B", role: "experiment" });

    const ids = nextActionsForCard(card).map(a => a.id);

    expect(ids).toContain("plan-experiment");
    expect(ids).not.toContain("extract-ideas");
  });

  it("falls back to card type for legacy cards with no role", () => {
    const chunk = createCard({ workspaceId: "w", type: "chunk", title: "C", body: "B" });

    const ids = nextActionsForCard(chunk).map(a => a.id);

    // chunk maps to the concept menu
    expect(ids).toContain("explain");
    expect(ids).toContain("study-cards");
  });

  it("uses the note menu for a plain note", () => {
    const ids = nextActionsForCard(note()).map(a => a.id);

    expect(ids).toEqual(["explain", "prerequisites", "attach-mission"]);
  });

  it("drops 'Attach to mission' when the workspace has no mission to attach to", () => {
    const ids = nextActionsForCard(note(), { hasMission: false }).map(a => a.id);

    expect(ids).not.toContain("attach-mission");
    expect(ids.length).toBeGreaterThan(0);
  });

  it("keeps 'Attach to mission' when a mission exists", () => {
    const ids = nextActionsForCard(note(), { hasMission: true }).map(a => a.id);

    expect(ids).toContain("attach-mission");
  });
});
