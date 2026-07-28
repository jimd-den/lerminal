import { describe, expect, it } from "bun:test";
import { presentAgentPreflight } from "../AgentPreflightPresenter";
import { findOperationPreset } from "../../../usecases/agent/operationPresets";
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
  it("blocks a selection-required preset when nothing is selected", () => {
    const preset = findOperationPreset("explain-selected")!;
    const model = presentAgentPreflight(baseState(), preset, "");

    expect(model.blockedReason).toBe("Select at least one card first");
  });

  it("blocks research-web until a query is entered", () => {
    const preset = findOperationPreset("research-web")!;
    const model = presentAgentPreflight(baseState(), preset, "");

    expect(model.blockedReason).toBe("Enter a search query");
  });

  it("warns (but does not block) when an agent preset has no API key configured", () => {
    const card = createCard({ id: "c1", workspaceId: "ws-1", type: "note", title: "N", body: "B" });
    const preset = findOperationPreset("explain-selected")!;
    const state = baseState({ cards: [card], selection: new Set([card.id]), openRouterKey: "" });

    const model = presentAgentPreflight(state, preset, "");

    expect(model.blockedReason).toBeNull();
    expect(model.warning).toContain("local template cards");
  });

  it("does not warn about the API key for research-web (it never calls the agent)", () => {
    const preset = findOperationPreset("research-web")!;
    const state = baseState({ openRouterKey: "" });

    const model = presentAgentPreflight(state, preset, "eigenvectors");

    expect(model.blockedReason).toBeNull();
    expect(model.warning).toBeNull();
    expect(model.webEnabled).toBe(true);
  });

  it("builds a context preview from the resolved scope, capped at 5 titles", () => {
    const cards = Array.from({ length: 8 }, (_, i) =>
      createCard({ id: `c${i}`, workspaceId: "ws-1", type: "note", title: `Note ${i}`, body: "b" })
    );
    const preset = findOperationPreset("explain-selected")!;
    const state = baseState({ cards, selection: new Set(cards.map(c => c.id)) });

    const model = presentAgentPreflight(state, preset, "");

    expect(model.selectedCount).toBe(8);
    expect(model.contextPreview.length).toBeLessThanOrEqual(5);
  });

  it("produces the exact run-button copy for research-web with a query", () => {
    const preset = findOperationPreset("research-web")!;
    const model = presentAgentPreflight(baseState(), preset, "eigenvectors");

    expect(model.runLabel).toBe('Research "eigenvectors" on the web');
  });

  it("includes the selection count in the run-button copy for selection-required presets", () => {
    const card = createCard({ id: "c1", workspaceId: "ws-1", type: "note", title: "N", body: "B" });
    const preset = findOperationPreset("plan-experiment")!;
    const state = baseState({ cards: [card], selection: new Set([card.id]) });

    const model = presentAgentPreflight(state, preset, "");

    expect(model.runLabel).toBe("Plan experiment (1 selected)");
  });
});
