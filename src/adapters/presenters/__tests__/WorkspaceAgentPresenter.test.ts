import { describe, expect, it } from "bun:test";
import {
  presentWorkspaceAgent,
  presentWorkspacePulse,
} from "../WorkspaceAgentPresenter";
import {
  DEFAULT_PERSONA_ID,
  WorkspaceAgentState,
} from "../../../usecases/workspaceAgent/WorkspaceAgentWorkflow";
import { Workspace } from "../../../entities/workspace";

const EMPTY_STATE: WorkspaceAgentState = {
  isOpen: false,
  workspaceId: null,
  context: { selectedCardIds: [], currentGroupId: null },
  personas: [],
  activePersonaId: DEFAULT_PERSONA_ID,
  conversationId: null,
  history: [],
  isHistoryOpen: false,
  messages: [],
  tagActions: {},
  isThinking: false,
  agentError: null,
};

const WORKSPACE: Workspace = {
  id: "w1",
  name: "My Workspace",
  createdAt: 0,
  fsrsConfig: {} as Workspace["fsrsConfig"],
};

describe("presentWorkspacePulse", () => {
  it("returns null for no observation", () => {
    expect(presentWorkspacePulse(null)).toBeNull();
  });

  it("is pure and deterministic for the same observation", () => {
    const observation = {
      kind: "unlinked-note-cluster" as const,
      message: "4 notes are ungrouped.",
      cardIds: ["a", "b"],
    };
    const first = presentWorkspacePulse(observation);
    const second = presentWorkspacePulse(observation);
    expect(first).toEqual(second);
    expect(first!.chips.length).toBeGreaterThan(0);
    expect(first!.chips.length).toBeLessThanOrEqual(3);
  });
});

describe("presentWorkspaceAgent", () => {
  it("handles the empty/closed state", () => {
    const view = presentWorkspaceAgent(EMPTY_STATE, [], null);
    expect(view.isOpen).toBe(false);
    expect(view.isEmpty).toBe(true);
    expect(view.messages).toEqual([]);
    expect(view.context).toEqual({
      workspaceName: "",
      groupLabel: null,
      cardCount: 0,
      focusCardTitle: null,
    });
  });

  it("projects an open session with resolved workspace name and group title", () => {
    const state: WorkspaceAgentState = {
      isOpen: true,
      workspaceId: "w1",
      personas: [],
      activePersonaId: DEFAULT_PERSONA_ID,
      conversationId: null,
      history: [],
      isHistoryOpen: false,
      context: { selectedCardIds: ["c1", "c2"], currentGroupId: "g1" },
      messages: [
        { id: "m1", speaker: "user", text: "hi", createdAt: 1, pending: true },
      ],
      tagActions: {},
      isThinking: false,
      agentError: null,
    };

    const view = presentWorkspaceAgent(state, [WORKSPACE], "Some Group");

    expect(view.isOpen).toBe(true);
    expect(view.context).toEqual({
      workspaceName: "My Workspace",
      groupLabel: "Some Group",
      cardCount: 2,
      focusCardTitle: null,
    });
    expect(view.isEmpty).toBe(false);
    expect(view.messages).toEqual([
      // A user message owns no proposals and no sent-context/reasoning disclosure.
      { id: "m1", speaker: "user", text: "hi", pending: true, webCitations: [], segments: [], streaming: false },
    ]);
  });

  it("is pure - calling twice with the same input yields equal output", () => {
    const state: WorkspaceAgentState = {
      isOpen: true,
      workspaceId: "w1",
      personas: [],
      activePersonaId: DEFAULT_PERSONA_ID,
      conversationId: null,
      history: [],
      isHistoryOpen: false,
      context: { selectedCardIds: [], currentGroupId: null },
      messages: [],
      tagActions: {},
      isThinking: false,
      agentError: null,
    };
    const first = presentWorkspaceAgent(state, [WORKSPACE], null);
    const second = presentWorkspaceAgent(state, [WORKSPACE], null);
    expect(first).toEqual(second);
  });
});


/**
 * The chip layer. `canAdd` is the gate on the `+`, so an unresolvable tag must project as
 * un-addable rather than as a button that would quietly do nothing.
 */
describe("presentWorkspaceAgent tag chips", () => {
  const stateWith = (segments: any[], tagActions = {}): WorkspaceAgentState => ({
    isOpen: true,
    workspaceId: "w1",
    personas: [],
    activePersonaId: DEFAULT_PERSONA_ID,
    conversationId: null,
    history: [],
    isHistoryOpen: false,
    context: { selectedCardIds: [], currentGroupId: null },
    messages: [
      { id: "m1", speaker: "assistant", text: "Worth keeping.", createdAt: 1, segments },
    ],
    tagActions,
    isThinking: false,
    agentError: null,
  });

  const tagSegment = (overrides: any = {}) => ({
    kind: "tag",
    tag: {
      id: "t1",
      kindLabel: "NOTE",
      title: "Spaced repetition",
      intent: { type: "create_cards", cards: [{ type: "note", title: "Spaced repetition", body: "b" }] },
      ...overrides,
    },
  });

  it("offers a resolvable tag as addable, in the 'offered' state", () => {
    const view = presentWorkspaceAgent(stateWith([tagSegment()]), [WORKSPACE], null);
    const tag = (view.messages[0].segments[0] as any).tag;
    expect(tag.canAdd).toBe(true);
    expect(tag.status).toBe("offered");
    expect(tag.messageId).toBe("m1");
  });

  it("marks a tag that resolved to nothing as un-addable, with the reason", () => {
    const view = presentWorkspaceAgent(
      stateWith([tagSegment({ intent: null, invalidReason: "No card matches that." })]),
      [WORKSPACE],
      null,
    );
    const tag = (view.messages[0].segments[0] as any).tag;
    expect(tag.canAdd).toBe(false);
    expect(tag.detail).toBe("No card matches that.");
  });

  it("reflects a settled add, keyed to the right message", () => {
    const view = presentWorkspaceAgent(
      stateWith([tagSegment()], { "m1:t1": { status: "done", resultMessage: "Created 1 card." } }),
      [WORKSPACE],
      null,
    );
    const tag = (view.messages[0].segments[0] as any).tag;
    expect(tag.status).toBe("done");
    expect(tag.detail).toBe("Created 1 card.");
  });
});
