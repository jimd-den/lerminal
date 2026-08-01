import { describe, expect, it } from "bun:test";
import { presentAgentPreflight } from "../AgentPreflightPresenter";
import { createCard } from "../../../entities/card";

function baseState(overrides: any = {}) {
  return {
    workspaces: [],
    activeWorkspaceId: "ws-1",
    cards: [],
    currentGroupId: null,
    selection: new Set<string>(),
    openRouterKey: "",
    selectedModel: "",
    ...overrides,
  };
}

describe("presentAgentPreflight", () => {
  it("returns null for an unknown preset id (never throws)", () => {
    expect(presentAgentPreflight(baseState(), "not-a-real-preset", "")).toBeNull();
  });

  it("blocks a selection-required preset when nothing is selected", () => {
    const model = presentAgentPreflight(baseState(), "explain-selected", "")!;

    expect(model.blockedReason).toBe("Select at least one card first");
  });

  it("blocks research-web until a query is entered", () => {
    const model = presentAgentPreflight(baseState(), "research-web", "")!;

    expect(model.blockedReason).toBe("Enter a search query");
  });

  it("warns (but does not block) when an agent preset has no API key configured", () => {
    const card = createCard({ id: "c1", workspaceId: "ws-1", type: "note", title: "N", body: "B" });
    const state = baseState({ cards: [card], selection: new Set([card.id]), openRouterKey: "" });

    const model = presentAgentPreflight(state, "explain-selected", "")!;

    expect(model.blockedReason).toBeNull();
    expect(model.warning).toContain("local template cards");
  });

  it("does not warn about the API key for research-web (it never calls the agent)", () => {
    const state = baseState({ openRouterKey: "" });

    const model = presentAgentPreflight(state, "research-web", "eigenvectors")!;

    expect(model.blockedReason).toBeNull();
    expect(model.warning).toBeNull();
    expect(model.webEnabled).toBe(true);
  });

  it("builds a context preview from the resolved scope, capped at 5 titles", () => {
    const cards = Array.from({ length: 8 }, (_, i) =>
      createCard({ id: `c${i}`, workspaceId: "ws-1", type: "note", title: `Note ${i}`, body: "b" })
    );
    const state = baseState({ cards, selection: new Set(cards.map(c => c.id)) });

    const model = presentAgentPreflight(state, "explain-selected", "")!;

    expect(model.selectedCount).toBe(8);
    expect(model.contextPreview.length).toBeLessThanOrEqual(5);
  });

  it("produces the exact run-button copy for research-web with a query", () => {
    const model = presentAgentPreflight(baseState(), "research-web", "eigenvectors")!;

    expect(model.runLabel).toBe('Research "eigenvectors" on the web');
  });

  it("includes the selection count in the run-button copy for selection-required presets", () => {
    const card = createCard({ id: "c1", workspaceId: "ws-1", type: "note", title: "N", body: "B" });
    const state = baseState({ cards: [card], selection: new Set([card.id]) });

    const model = presentAgentPreflight(state, "plan-experiment", "")!;

    expect(model.runLabel).toBe("Plan experiment (1 selected)");
  });

  it("suggests selected card titles as search queries for research-web", () => {
    const card = createCard({ id: "c1", workspaceId: "ws-1", type: "note", title: "Eigenvector intuition", body: "B" });
    const state = baseState({ cards: [card], selection: new Set([card.id]) });

    const model = presentAgentPreflight(state, "research-web", "")!;

    expect(model.querySuggestions).toContain("Eigenvector intuition");
  });

  it("suggests uncovered gap-report success criteria and the mission title as search queries", () => {
    const state = baseState({
      gapReport: {
        hasMission: true,
        missionTitle: "Ship a renderer",
        successCriteria: [
          { text: "Renders a textured cube", hasEvidence: false },
          { text: "Runs at 60fps", hasEvidence: true },
        ],
      },
    });

    const model = presentAgentPreflight(state, "research-web", "")!;

    expect(model.querySuggestions).toContain("Renders a textured cube");
    expect(model.querySuggestions).not.toContain("Runs at 60fps");
    expect(model.querySuggestions).toContain("Ship a renderer");
  });

  it("never suggests search queries for presets that don't take a typed query", () => {
    const card = createCard({ id: "c1", workspaceId: "ws-1", type: "note", title: "N", body: "B" });
    const state = baseState({ cards: [card], selection: new Set([card.id]) });

    const model = presentAgentPreflight(state, "explain-selected", "")!;

    expect(model.querySuggestions).toEqual([]);
  });

  it("dedupes and caps query suggestions at 4", () => {
    const card = createCard({ id: "c1", workspaceId: "ws-1", type: "note", title: "Ship a renderer", body: "B" });
    const state = baseState({
      cards: [card],
      selection: new Set([card.id]),
      gapReport: {
        hasMission: true,
        missionTitle: "Ship a renderer",
        successCriteria: [
          { text: "A", hasEvidence: false },
          { text: "B", hasEvidence: false },
          { text: "C", hasEvidence: false },
        ],
      },
    });

    const model = presentAgentPreflight(state, "research-web", "")!;

    expect(model.querySuggestions.length).toBeLessThanOrEqual(4);
    // "Ship a renderer" appears both as the card title and the mission title — deduped.
    expect(model.querySuggestions.filter(s => s === "Ship a renderer").length).toBe(1);
  });
});
