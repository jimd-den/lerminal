import { describe, expect, it } from "bun:test";
import { canEnrollInStudy, selectionActions } from "../selectionActions";
import { createCard } from "../../../entities/card";
import { BUILTIN_CARD_TYPES } from "../../../entities/cardTypeDefinition";

const noteWithText = () => createCard({ workspaceId: "w", type: "note", title: "N", body: "Some text" });
const question = () => createCard({ workspaceId: "w", type: "question", title: "Q?", body: "", answer: "A" });

function byId(cards: ReturnType<typeof selectionActions>) {
  return Object.fromEntries(cards.map(a => [a.id, a]));
}

describe("selectionActions", () => {
  it("always returns the same five actions in the same order", () => {
    for (const selectedCards of [[], [noteWithText()], [noteWithText(), question()]]) {
      const ids = selectionActions({ selectedCards }).map(a => a.id);
      expect(ids).toEqual(["explain", "research", "connect", "study", "more"]);
    }
  });

  it("disables selection-dependent actions with a reason when nothing is selected", () => {
    const actions = byId(selectionActions({ selectedCards: [] }));

    expect(actions.explain.enabled).toBe(false);
    expect(actions.explain.disabledReason).toBe("Select cards first");
    expect(actions.connect.enabled).toBe(false);
    expect(actions.study.enabled).toBe(false);
  });

  it("keeps Research available with an empty selection — it reads the web, not the selection", () => {
    const actions = byId(selectionActions({ selectedCards: [] }));

    expect(actions.research.enabled).toBe(true);
    expect(actions.research.disabledReason).toBeNull();
  });

  it("keeps More available always, since the palette is the escape hatch", () => {
    const actions = byId(selectionActions({ selectedCards: [] }));

    expect(actions.more.enabled).toBe(true);
    expect(actions.more.dispatch).toEqual({ kind: "palette" });
  });

  it("requires two or more cards before Connect is enabled", () => {
    const one = byId(selectionActions({ selectedCards: [noteWithText()] }));
    expect(one.connect.enabled).toBe(false);
    expect(one.connect.disabledReason).toContain("two or more");

    const two = byId(selectionActions({ selectedCards: [noteWithText(), question()] }));
    expect(two.connect.enabled).toBe(true);
  });

  it("disables Explain when the selection has no readable text", () => {
    const emptyGroup = createCard({ workspaceId: "w", type: "group", title: "G", body: "" });

    const actions = byId(selectionActions({ selectedCards: [emptyGroup] }));

    expect(actions.explain.enabled).toBe(false);
    expect(actions.explain.disabledReason).toContain("no text");
  });

  it("enables Explain when a selected card carries an answer but an empty body", () => {
    const actions = byId(selectionActions({ selectedCards: [question()] }));

    expect(actions.explain.enabled).toBe(true);
  });

  it("routes AI-backed tray actions through the preflight, never a direct gateway call", () => {
    const actions = byId(selectionActions({ selectedCards: [noteWithText()] }));

    expect(actions.explain.dispatch).toEqual({ kind: "preflight", presetId: "explain-selected" });
    expect(actions.research.dispatch).toEqual({ kind: "preflight", presetId: "research-web" });
    expect(actions.study.dispatch).toEqual({ kind: "preflight", presetId: "make-study-cards" });
    // Connect is deterministic grouping — no model involved, so it runs the command directly.
    expect(actions.connect.dispatch).toEqual({ kind: "pipeline", text: "group" });
  });
});

describe("canEnrollInStudy", () => {
  it("is false for plain notes with no learning behavior", () => {
    expect(canEnrollInStudy({ selectedCards: [noteWithText()], cardTypes: BUILTIN_CARD_TYPES })).toBe(false);
  });

  it("is true once the selection contains practice material", () => {
    expect(canEnrollInStudy({ selectedCards: [noteWithText(), question()], cardTypes: BUILTIN_CARD_TYPES })).toBe(true);
  });
});
