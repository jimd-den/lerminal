import { describe, expect, it } from "bun:test";
import {
  presentWorkspaceAgent,
  presentWorkspacePulse,
} from "../WorkspaceAgentPresenter";
import { WorkspaceAgentState } from "../../../usecases/workspaceAgent/WorkspaceAgentWorkflow";
import { Workspace } from "../../../entities/workspace";

const EMPTY_STATE: WorkspaceAgentState = {
  isOpen: false,
  workspaceId: null,
  context: { selectedCardIds: [], currentGroupId: null },
  messages: [],
  proposals: [],
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
    expect(view.context).toEqual({ workspaceName: "", groupLabel: null, selectedCount: 0 });
  });

  it("projects an open session with resolved workspace name and group title", () => {
    const state: WorkspaceAgentState = {
      isOpen: true,
      workspaceId: "w1",
      context: { selectedCardIds: ["c1", "c2"], currentGroupId: "g1" },
      messages: [
        { id: "m1", speaker: "user", text: "hi", createdAt: 1, pending: true },
      ],
      proposals: [],
      isThinking: false,
      agentError: null,
    };

    const view = presentWorkspaceAgent(state, [WORKSPACE], "Some Group");

    expect(view.isOpen).toBe(true);
    expect(view.context).toEqual({
      workspaceName: "My Workspace",
      groupLabel: "Some Group",
      selectedCount: 2,
    });
    expect(view.isEmpty).toBe(false);
    expect(view.messages).toEqual([
      { id: "m1", speaker: "user", text: "hi", pending: true },
    ]);
  });

  it("is pure - calling twice with the same input yields equal output", () => {
    const state: WorkspaceAgentState = {
      isOpen: true,
      workspaceId: "w1",
      context: { selectedCardIds: [], currentGroupId: null },
      messages: [],
      proposals: [],
      isThinking: false,
      agentError: null,
    };
    const first = presentWorkspaceAgent(state, [WORKSPACE], null);
    const second = presentWorkspaceAgent(state, [WORKSPACE], null);
    expect(first).toEqual(second);
  });
});
