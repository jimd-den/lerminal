import { describe, expect, it } from "bun:test";
import { presentAppState, PresentAppStateInput } from "../presentAppState";
import {
  createInitialDomainState,
  createInitialUiState,
} from "../AppSessionStore";
import { Card, createCard } from "../../../entities/card";

const card = (id: string, parentId?: string, type: Card["type"] = "note"): Card => ({
  ...createCard({ workspaceId: "w1", type, title: id, body: "b", parentId }),
  id,
});

function input(overrides: Partial<PresentAppStateInput> = {}): PresentAppStateInput {
  return {
    domain: createInitialDomainState(),
    ui: createInitialUiState(),
    research: {
      query: "",
      results: [],
      isOpen: false,
      loading: false,
      error: null,
      isCreatingBrief: false,
    },
    mission: {
      draft: {
        goalTitle: "",
        goalDescription: "",
        successCriteria: [],
        targetDeliverable: "",
      },
      isEditorOpen: false,
      isGapReportOpen: false,
    },
    operations: { pending: [], result: null, undoableOperationId: null },
    review: { queue: [], index: 0, isOpen: false, revealAnswer: false },
    gapReport: null,
    workspacePulseObservation: null,
    workspaceAgent: {
      isOpen: false,
      workspaceId: null,
      context: { selectedCardIds: [], currentGroupId: null },
      personas: [],
      activePersonaId: "griot",
      conversationId: null,
      history: [],
      isHistoryOpen: false,
      messages: [],
      tagActions: {},
      isThinking: false,
      agentError: null,
    },
    workspaceAgentGroupTitle: null,
    linkedCardsForOpenCard: [],
    ...overrides,
  };
}

describe("presentAppState", () => {
  it("shows only the current group's children as visible cards", () => {
    const domain = createInitialDomainState();
    domain.cards = [card("g1", undefined, "group"), card("a", "g1"), card("b")];
    domain.currentGroupId = "g1";

    const state = presentAppState(input({ domain }));

    expect(state.visibleCards.map((c) => c.id)).toEqual(["a"]);
    expect(state.cards).toHaveLength(3);
  });

  it("builds the breadcrumb trail to the current group", () => {
    const domain = createInitialDomainState();
    domain.cards = [
      card("g1", undefined, "group"),
      card("g2", "g1", "group"),
      card("a", "g2"),
    ];
    domain.currentGroupId = "g2";

    expect(presentAppState(input({ domain })).breadcrumb.map((c) => c.id)).toEqual([
      "g1",
      "g2",
    ]);
  });

  it("hands the UI copies, so a component cannot mutate the session", () => {
    const domain = createInitialDomainState();
    domain.cards = [card("a")];
    domain.selection = new Set(["a"]);
    domain.workspaces = [];

    const state = presentAppState(input({ domain }));
    state.cards.push(card("intruder"));
    state.selection.add("intruder");
    state.pinnedCommands.push("intruder");
    state.cardTypes.pop();

    expect(domain.cards).toHaveLength(1);
    expect([...domain.selection]).toEqual(["a"]);
    expect(domain.pinnedCommands).not.toContain("intruder");
    expect(domain.cardTypes.length).toBeGreaterThan(0);
  });

  it("copies the mission draft's criteria rather than sharing the array", () => {
    const base = input();
    base.mission.draft.successCriteria = ["one"];

    const state = presentAppState(base);
    state.missionDraft.successCriteria.push("two");

    expect(base.mission.draft.successCriteria).toEqual(["one"]);
  });

  it("reads review state from the session, not from domain state", () => {
    const queue = [card("a"), card("b")];
    const state = presentAppState(
      input({ review: { queue, index: 1, isOpen: true, revealAnswer: true } }),
    );

    expect(state.reviewQueue.map((c) => c.id)).toEqual(["a", "b"]);
    expect(state.reviewIndex).toBe(1);
    expect(state.isReviewOpen).toBe(true);
    expect(state.reviewRevealAnswer).toBe(true);
  });

  it("reads operation state from the operations workflow", () => {
    const result = {
      summary: "2 items created",
      createdCardIds: ["a", "b"],
      destination: { spaceId: "w1" },
      primaryActionLabel: "Open result",
    };
    const state = presentAppState(
      input({
        operations: {
          pending: [{ id: "op-1", commandName: "chunk", status: "loading" }],
          result,
          undoableOperationId: "rec-1",
        },
      }),
    );

    expect(state.pendingOperations).toHaveLength(1);
    expect(state.operationResult).toEqual(result);
    expect(state.undoableOperationId).toBe("rec-1");
  });

  it("reads research state from the research workflow", () => {
    const state = presentAppState(
      input({
        research: {
          query: "spaced repetition",
          results: [],
          isOpen: true,
          loading: true,
          error: "Search failed",
          isCreatingBrief: false,
        },
      }),
    );

    expect(state.researchQuery).toBe("spaced repetition");
    expect(state.isResearchOpen).toBe(true);
    expect(state.researchLoading).toBe(true);
    expect(state.researchError).toBe("Search failed");
  });

  it("passes the freshly computed gap report straight through", () => {
    const gapReport = { headline: "x" } as any;
    expect(presentAppState(input({ gapReport })).gapReport).toBe(gapReport);
    expect(presentAppState(input()).gapReport).toBeNull();
  });

  it("surfaces a storage failure so the UI can offer a retry", () => {
    const ui = createInitialUiState();
    ui.storageError = "Your saved work could not be opened.";

    expect(presentAppState(input({ ui })).storageError).toBe(
      "Your saved work could not be opened.",
    );
  });
});
