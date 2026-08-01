import { describe, expect, it } from "bun:test";
import { presentCommandPalette } from "../CommandPalettePresenter";
import { createCard } from "../../../entities/card";

function baseState(overrides: any = {}) {
  return {
    cards: [],
    selection: new Set<string>(),
    commandDefinitions: [],
    pinnedCommands: ["ask", "chunk"],
    ...overrides,
  };
}

describe("presentCommandPalette", () => {
  it("says plainly when nothing is selected", () => {
    const model = presentCommandPalette(baseState() as any);

    expect(model.selectedCount).toBe(0);
    expect(model.selectionSummary).toContain("Nothing selected");
  });

  it("counts the cards a command would actually receive, expanding a selected group", () => {
    const group = createCard({ id: "g1", workspaceId: "w", type: "group", title: "G", body: "" });
    const child = createCard({ id: "c1", workspaceId: "w", type: "note", title: "C", body: "B", parentId: "g1" });
    const state = baseState({ cards: [group, child], selection: new Set(["g1"]) });

    const model = presentCommandPalette(state as any);

    expect(model.selectedCount).toBe(2);
    expect(model.selectionSummary).toBe("2 cards selected");
  });

  it("uses the singular for one card", () => {
    const card = createCard({ id: "c1", workspaceId: "w", type: "note", title: "C", body: "B" });
    const state = baseState({ cards: [card], selection: new Set(["c1"]) });

    expect(presentCommandPalette(state as any).selectionSummary).toBe("1 card selected");
  });

  it("marks selection-requiring actions unavailable with a reason when nothing is selected", () => {
    const model = presentCommandPalette(baseState() as any);
    const explain = model.actions.find(a => a.action.id === "explain")!;
    const research = model.actions.find(a => a.action.id === "research")!;

    expect(explain.availability.runnable).toBe(false);
    expect(explain.availability.reason).toBe("Select cards first");
    // Research reads the web, not the selection, so it stands alone.
    expect(research.availability.runnable).toBe(true);
  });

  it("enables selection-requiring actions once cards are selected", () => {
    const card = createCard({ id: "c1", workspaceId: "w", type: "note", title: "C", body: "B" });
    const state = baseState({ cards: [card], selection: new Set(["c1"]) });

    const model = presentCommandPalette(state as any);

    expect(model.actions.find(a => a.action.id === "explain")!.availability.runnable).toBe(true);
  });

  it("pairs every documented command with its availability", () => {
    const model = presentCommandPalette(baseState() as any);

    expect(model.commands.length).toBeGreaterThan(0);
    const chunk = model.commands.find(c => c.doc.name === "chunk")!;
    expect(chunk.availability.runnable).toBe(false);
    const review = model.commands.find(c => c.doc.name === "review")!;
    expect(review.availability.runnable).toBe(true);
  });

  it("passes custom commands and pinned keywords through untouched", () => {
    const custom = [{ id: "1", name: "explain-simply", description: "d", kind: "agent", systemPrompt: "p", createdAt: 0 }];
    const state = baseState({ commandDefinitions: custom });

    const model = presentCommandPalette(state as any);

    expect(model.customCommands).toBe(custom as any);
    expect(model.pinnedCommands).toEqual(["ask", "chunk"]);
  });
});
