import { describe, expect, it } from "bun:test";
import { observeWorkspace } from "../observeWorkspace";
import { createCard } from "../../../entities/card";

const WS = "w1";

describe("observeWorkspace", () => {
  it("returns null for an empty workspace", () => {
    expect(observeWorkspace([], WS)).toBeNull();
  });

  it("returns null when there is no signal at all", () => {
    const cards = [
      createCard({ workspaceId: WS, type: "note", title: "one", body: "" }),
      createCard({ workspaceId: WS, type: "note", title: "two", body: "", parentId: "group1" }),
    ];
    expect(observeWorkspace(cards, WS)).toBeNull();
  });

  it("only looks at cards in the given workspace", () => {
    const cards = [
      createCard({ workspaceId: "other", type: "note", title: "a", body: "" }),
      createCard({ workspaceId: "other", type: "note", title: "b", body: "" }),
      createCard({ workspaceId: "other", type: "note", title: "c", body: "" }),
      createCard({ workspaceId: "other", type: "note", title: "d", body: "" }),
    ];
    expect(observeWorkspace(cards, WS)).toBeNull();
  });

  it("surfaces an open question with a cluster of sibling notes", () => {
    const question = createCard({
      workspaceId: WS,
      type: "question",
      title: "What's the plan?",
      body: "",
      parentId: "group1",
    });
    const notes = [
      createCard({ workspaceId: WS, type: "note", title: "n1", body: "", parentId: "group1" }),
      createCard({ workspaceId: WS, type: "note", title: "n2", body: "", parentId: "group1" }),
      createCard({ workspaceId: WS, type: "note", title: "n3", body: "", parentId: "group1" }),
    ];
    const observation = observeWorkspace([question, ...notes], WS);
    expect(observation).not.toBeNull();
    expect(observation!.kind).toBe("notes-need-question");
    expect(observation!.cardIds).toContain(question.id);
  });

  it("does not surface an answered question even with sibling notes", () => {
    const question = createCard({
      workspaceId: WS,
      type: "question",
      title: "What's the plan?",
      body: "",
      answer: "This is the answer.",
      parentId: "group1",
    });
    const notes = [
      createCard({ workspaceId: WS, type: "note", title: "n1", body: "", parentId: "group1" }),
      createCard({ workspaceId: WS, type: "note", title: "n2", body: "", parentId: "group1" }),
      createCard({ workspaceId: WS, type: "note", title: "n3", body: "", parentId: "group1" }),
    ];
    expect(observeWorkspace([question, ...notes], WS)).toBeNull();
  });

  it("surfaces an un-extracted source (has a URL cite, no body)", () => {
    const source = createCard({
      workspaceId: WS,
      type: "source",
      title: "Some article",
      body: "",
      cite: "https://example.com/article",
    });
    const observation = observeWorkspace([source], WS);
    expect(observation).not.toBeNull();
    expect(observation!.kind).toBe("unextracted-source");
    expect(observation!.cardIds).toEqual([source.id]);
  });

  it("does not surface a source that has already been extracted", () => {
    const source = createCard({
      workspaceId: WS,
      type: "source",
      title: "Some article",
      body: "Full extracted text here.",
      cite: "https://example.com/article",
    });
    expect(observeWorkspace([source], WS)).toBeNull();
  });

  it("surfaces a loose cluster of unlinked, ungrouped notes", () => {
    const notes = [
      createCard({ workspaceId: WS, type: "note", title: "n1", body: "x" }),
      createCard({ workspaceId: WS, type: "note", title: "n2", body: "x" }),
      createCard({ workspaceId: WS, type: "note", title: "n3", body: "x" }),
      createCard({ workspaceId: WS, type: "note", title: "n4", body: "x" }),
    ];
    const observation = observeWorkspace(notes, WS);
    expect(observation).not.toBeNull();
    expect(observation!.kind).toBe("unlinked-note-cluster");
    expect(observation!.cardIds).toHaveLength(4);
  });

  it("returns at most one observation, prioritizing questions over loose notes", () => {
    const question = createCard({
      workspaceId: WS,
      type: "question",
      title: "Q",
      body: "",
      parentId: "group1",
    });
    const questionSiblings = [
      createCard({ workspaceId: WS, type: "note", title: "n1", body: "", parentId: "group1" }),
      createCard({ workspaceId: WS, type: "note", title: "n2", body: "", parentId: "group1" }),
      createCard({ workspaceId: WS, type: "note", title: "n3", body: "", parentId: "group1" }),
    ];
    const looseNotes = [
      createCard({ workspaceId: WS, type: "note", title: "l1", body: "x" }),
      createCard({ workspaceId: WS, type: "note", title: "l2", body: "x" }),
      createCard({ workspaceId: WS, type: "note", title: "l3", body: "x" }),
      createCard({ workspaceId: WS, type: "note", title: "l4", body: "x" }),
    ];
    const observation = observeWorkspace([question, ...questionSiblings, ...looseNotes], WS);
    expect(observation).not.toBeNull();
    expect(observation!.kind).toBe("notes-need-question");
  });

  it("never claims AI or web activity happened", () => {
    const question = createCard({
      workspaceId: WS,
      type: "question",
      title: "Q",
      body: "",
      parentId: "group1",
    });
    const notes = [
      createCard({ workspaceId: WS, type: "note", title: "n1", body: "", parentId: "group1" }),
      createCard({ workspaceId: WS, type: "note", title: "n2", body: "", parentId: "group1" }),
      createCard({ workspaceId: WS, type: "note", title: "n3", body: "", parentId: "group1" }),
    ];
    const source = createCard({
      workspaceId: WS,
      type: "source",
      title: "Article",
      body: "",
      cite: "https://example.com",
    });
    const looseNotes = [
      createCard({ workspaceId: WS, type: "note", title: "l1", body: "x" }),
      createCard({ workspaceId: WS, type: "note", title: "l2", body: "x" }),
      createCard({ workspaceId: WS, type: "note", title: "l3", body: "x" }),
      createCard({ workspaceId: WS, type: "note", title: "l4", body: "x" }),
    ];

    const forbidden = /\b(ai|artificial intelligence|model|gpt|web search|searched the web|browsed)\b/i;

    for (const cards of [
      [question, ...notes],
      [source],
      looseNotes,
    ]) {
      const observation = observeWorkspace(cards, WS);
      expect(observation).not.toBeNull();
      expect(forbidden.test(observation!.message)).toBe(false);
      expect(forbidden.test(observation!.kind)).toBe(false);
    }
  });
});
