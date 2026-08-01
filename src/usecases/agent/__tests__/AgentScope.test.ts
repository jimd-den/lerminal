import { describe, expect, it } from "bun:test";
import { createCard } from "../../../entities/card";
import { resolveScopedContext } from "../AgentScope";

describe("resolveScopedContext", () => {
  it("web scope never reads any cards", () => {
    const selected = [createCard({ workspaceId: "w", type: "note", title: "N", body: "B" })];
    const result = resolveScopedContext({ scope: "web", allCards: selected, selectedCards: selected, parentId: null });

    expect(result.cards).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it("selected-only returns exactly the selection, nothing from the rest of the workspace", () => {
    const selected = createCard({ workspaceId: "w", type: "note", title: "Selected", body: "B" });
    const other = createCard({ workspaceId: "w", type: "note", title: "Other", body: "B" });
    const result = resolveScopedContext({
      scope: "selected-only",
      allCards: [selected, other],
      selectedCards: [selected],
      parentId: null,
    });

    expect(result.cards.map(c => c.id)).toEqual([selected.id]);
  });

  it("workspace scope adds the breadcrumb ancestor chain and same-group siblings", () => {
    const grandparent = createCard({ id: "gp", workspaceId: "w", type: "group", title: "GP", body: "" });
    const parent = createCard({ id: "p", workspaceId: "w", type: "group", title: "P", body: "", parentId: "gp" });
    const selected = createCard({ id: "sel", workspaceId: "w", type: "note", title: "Sel", body: "B", parentId: "p" });
    const sibling = createCard({ id: "sib", workspaceId: "w", type: "note", title: "Sib", body: "B", parentId: "p" });
    const unrelated = createCard({ id: "un", workspaceId: "w", type: "note", title: "Unrelated", body: "B" });
    const allCards = [grandparent, parent, selected, sibling, unrelated];

    const result = resolveScopedContext({
      scope: "workspace",
      allCards,
      selectedCards: [selected],
      parentId: "p",
    });

    const ids = result.cards.map(c => c.id);
    expect(ids).toContain("sel");
    expect(ids).toContain("p");
    expect(ids).toContain("gp");
    expect(ids).toContain("sib");
    expect(ids).not.toContain("un");
    // Selection must lead (highest priority).
    expect(ids[0]).toBe("sel");
  });

  it("reports truncation and caps at maxCards when candidates exceed the budget", () => {
    const parent = createCard({ id: "p", workspaceId: "w", type: "group", title: "P", body: "" });
    const siblings = Array.from({ length: 10 }, (_, i) =>
      createCard({ id: `s${i}`, workspaceId: "w", type: "note", title: `S${i}`, body: "b", parentId: "p" })
    );
    const result = resolveScopedContext({
      scope: "workspace",
      allCards: [parent, ...siblings],
      selectedCards: [],
      parentId: "p",
      budget: { maxCards: 3, maxCharacters: 100000 },
    });

    expect(result.cards.length).toBe(3);
    expect(result.truncated).toBe(true);
    expect(result.totalConsideredCount).toBeGreaterThan(3);
  });

  it("reports truncation when the character budget is exceeded, but always includes at least one card", () => {
    const huge = createCard({ workspaceId: "w", type: "note", title: "Huge", body: "x".repeat(500) });
    const second = createCard({ workspaceId: "w", type: "note", title: "Second", body: "y".repeat(500) });
    const result = resolveScopedContext({
      scope: "selected-only",
      allCards: [huge, second],
      selectedCards: [huge, second],
      parentId: null,
      budget: { maxCards: 10, maxCharacters: 100 },
    });

    expect(result.cards.length).toBe(1);
    expect(result.cards[0].id).toBe(huge.id);
    expect(result.truncated).toBe(true);
  });

  it("keeps the selection when a crowded workspace would otherwise fill the budget", () => {
    const selected = createCard({ id: "sel", workspaceId: "w", type: "note", title: "Sel", body: "SELECTED BODY" });
    const noise = Array.from({ length: 100 }, (_, i) =>
      createCard({ id: `n${i}`, workspaceId: "w", type: "note", title: `N${i}`, body: "x".repeat(200) }),
    );

    const result = resolveScopedContext({
      scope: "workspace",
      allCards: [...noise, selected],
      selectedCards: [selected],
      parentId: null,
    });

    expect(result.cards[0].id).toBe("sel");
    expect(result.truncated).toBe(true);
  });

  it("de-duplicates a card that is both selected and a breadcrumb ancestor", () => {
    const parent = createCard({ id: "p", workspaceId: "w", type: "group", title: "P", body: "" });
    const result = resolveScopedContext({
      scope: "workspace",
      allCards: [parent],
      selectedCards: [parent],
      parentId: "p",
    });

    expect(result.cards.length).toBe(1);
  });
});
