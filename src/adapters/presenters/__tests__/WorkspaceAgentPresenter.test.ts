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
      cardCount: 2,
      focusCardTitle: null,
    });
    expect(view.isEmpty).toBe(false);
    expect(view.messages).toEqual([
      // A user message owns no proposals and no sent-context/reasoning disclosure.
      { id: "m1", speaker: "user", text: "hi", pending: true, webCitations: [], proposals: [] },
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

describe("presentWorkspaceAgent proposal items", () => {
  const cards = [
    {
      id: "c1",
      workspaceId: "w1",
      type: "note" as const,
      title: "Note A",
      body: "body a",
      createdAt: 0,
      tags: [],
    },
    {
      id: "c2",
      workspaceId: "w1",
      type: "note" as const,
      title: "Note B",
      body: "body b",
      createdAt: 0,
      tags: [],
    },
  ];

  const stateWith = (
    tool: any,
    selectedItemKeys?: string[],
  ): WorkspaceAgentState => ({
    ...EMPTY_STATE,
    isOpen: true,
    workspaceId: "w1",
    proposals: [
      {
        action: { id: "p1", label: "Do it", explanation: "why", requiresConfirmation: true, tool },
        status: "proposed",
        ...(selectedItemKeys ? { selectedItemKeys } : {}),
      },
    ],
  });

  it("resolves card ids to real card titles and bodies", () => {
    const view = presentWorkspaceAgent(
      stateWith({ type: "create_group", name: "Cluster", cardIds: ["c1", "c2"] }, ["c1", "c2"]),
      [WORKSPACE],
      null,
      null,
      cards,
    );
    expect(view.proposals[0].items).toEqual([
      { key: "c1", title: "Note A", detail: "body a", selected: true },
      { key: "c2", title: "Note B", detail: "body b", selected: true },
    ]);
  });

  it("reflects deselection in `selected`, the summary, and `canConfirm`", () => {
    const view = presentWorkspaceAgent(
      stateWith(
        {
          type: "create_cards",
          cards: [
            { type: "note", title: "A", body: "a" },
            { type: "note", title: "B", body: "b" },
            { type: "note", title: "C", body: "c" },
          ],
        },
        ["card-0", "card-2"],
      ),
      [WORKSPACE],
      null,
    );
    expect(view.proposals[0].items.map((i) => i.selected)).toEqual([true, false, true]);
    // The summary describes what confirming would really do, not the original count.
    expect(view.proposals[0].toolSummary).toBe("Create 2 cards");
    expect(view.proposals[0].canConfirm).toBe(true);
  });

  it("disables confirm when nothing is selected", () => {
    const view = presentWorkspaceAgent(
      stateWith({ type: "search_web", queries: ["q1"], purpose: "p" }, []),
      [WORKSPACE],
      null,
    );
    expect(view.proposals[0].canConfirm).toBe(false);
    expect(view.proposals[0].items.every((i) => !i.selected)).toBe(true);
  });

  it("gives single-target intents no items and leaves them confirmable", () => {
    const view = presentWorkspaceAgent(
      stateWith({ type: "extract_url", cardId: "c1" }),
      [WORKSPACE],
      null,
      null,
      cards,
    );
    expect(view.proposals[0].items).toEqual([]);
    expect(view.proposals[0].canConfirm).toBe(true);
  });

  it("projects real citations as receipts on the message that used them", () => {
    const state: WorkspaceAgentState = {
      isOpen: true,
      workspaceId: "w1",
      context: { selectedCardIds: [], currentGroupId: null },
      messages: [
        { id: "u1", speaker: "user", text: "sources?", createdAt: 1 },
        {
          id: "a1",
          speaker: "assistant",
          text: "Two of them.",
          createdAt: 2,
          webCitations: [{ url: "https://a.example", title: "A paper" }],
        },
      ],
      proposals: [],
      isThinking: false,
      agentError: null,
    };

    const view = presentWorkspaceAgent(state, [WORKSPACE], null);

    expect(view.messages[0].webCitations).toEqual([]);
    expect(view.messages[1].webCitations).toEqual([
      { url: "https://a.example", title: "A paper" },
    ]);
  });

  it("shows no receipts when nothing was actually consulted", () => {
    const state: WorkspaceAgentState = {
      isOpen: true,
      workspaceId: "w1",
      context: { selectedCardIds: [], currentGroupId: null },
      messages: [{ id: "a1", speaker: "assistant", text: "From your notes.", createdAt: 2 }],
      proposals: [],
      isThinking: false,
      agentError: null,
    };

    expect(presentWorkspaceAgent(state, [WORKSPACE], null).messages[0].webCitations).toEqual([]);
  });
});

/**
 * The disclosure and the inline action links are both presentation of things the workflow
 * already decided. These pin that the projection cannot invent either one: no reasoning
 * where the model returned none, and no proposal attached to a message that didn't
 * produce it.
 */
describe("presentWorkspaceAgent turn transparency", () => {
  const CARDS = [
    {
      id: "c1",
      workspaceId: "w1",
      type: "note" as const,
      title: "Spacing effect",
      body: "b1",
      createdAt: 0,
      tags: [],
    },
    {
      id: "c2",
      workspaceId: "w1",
      type: "note" as const,
      title: "Interleaving",
      body: "b2",
      createdAt: 0,
      tags: [],
    },
  ];

  const stateWith = (
    overrides: Partial<WorkspaceAgentState>,
  ): WorkspaceAgentState => ({
    ...EMPTY_STATE,
    isOpen: true,
    workspaceId: "w1",
    ...overrides,
  });

  const reply = (extras: Record<string, unknown> = {}) => ({
    id: "m2",
    speaker: "assistant" as const,
    text: "Here's what I see.",
    createdAt: 2,
    ...extras,
  });

  const sentContext = {
    groupId: null,
    cardIds: ["c1", "c2"],
    focusCardIds: ["c1"],
    briefing: "Cards in scope (id, type, title, body):\n- [c1] [focus] ...",
  };

  it("projects the sent context with the true ids, resolved titles, and focus marks", () => {
    const view = presentWorkspaceAgent(
      stateWith({ messages: [reply({ sentContext })] }),
      [WORKSPACE],
      null,
      null,
      CARDS,
    );

    const sent = view.messages[0].sentContext!;
    // Exactly the ids that were sent — no additions, no reordering, no omissions.
    expect(sent.cards.map((card) => card.id)).toEqual(["c1", "c2"]);
    expect(sent.cards.map((card) => card.title)).toEqual(["Spacing effect", "Interleaving"]);
    expect(sent.cards.map((card) => card.focus)).toEqual([true, false]);
    expect(sent.briefing).toBe(sentContext.briefing);
    expect(sent.groupLabel).toBeNull();
  });

  it("falls back to the raw id for a card that no longer exists, rather than dropping it", () => {
    const view = presentWorkspaceAgent(
      stateWith({
        messages: [reply({ sentContext: { ...sentContext, cardIds: ["c1", "gone"] } })],
      }),
      [WORKSPACE],
      null,
      null,
      CARDS,
    );

    expect(view.messages[0].sentContext!.cards.map((card) => card.id)).toEqual(["c1", "gone"]);
    expect(view.messages[0].sentContext!.cards[1].title).toBe("gone");
  });

  it("projects reasoning verbatim when the model returned some", () => {
    const view = presentWorkspaceAgent(
      stateWith({ messages: [reply({ sentContext, reasoning: "I compared the two notes." })] }),
      [WORKSPACE],
      null,
      null,
      CARDS,
    );

    expect(view.messages[0].reasoning).toBe("I compared the two notes.");
  });

  it("carries no reasoning field at all when the model returned none", () => {
    const view = presentWorkspaceAgent(
      stateWith({ messages: [reply({ sentContext })] }),
      [WORKSPACE],
      null,
      null,
      CARDS,
    );

    const message = view.messages[0];
    expect(message.reasoning).toBeUndefined();
    expect("reasoning" in message).toBe(false);
    // Nothing else stands in for it either — the answer is not re-served as "thinking".
    expect(JSON.stringify(message)).not.toContain("thinking");
  });

  it("attaches a proposal to the message that produced it, and to no other", () => {
    const action = {
      id: "p1",
      label: "Group these",
      explanation: "They're about one thing.",
      requiresConfirmation: true,
      tool: { type: "create_group" as const, name: "Spacing", cardIds: ["c1", "c2"] },
    };

    const view = presentWorkspaceAgent(
      stateWith({
        messages: [
          reply({ id: "m1", text: "Older reply." }),
          reply({ id: "m2", proposalIds: ["p1"] }),
        ],
        proposals: [{ action, status: "proposed", messageId: "m2", selectedItemKeys: ["c1", "c2"] }],
      }),
      [WORKSPACE],
      null,
      null,
      CARDS,
    );

    expect(view.messages[0].proposals).toEqual([]);
    expect(view.messages[1].proposals.map((p) => p.id)).toEqual(["p1"]);
    // Attached proposals are not also rendered as free-floating cards.
    expect(view.detachedProposals).toEqual([]);
    // The full set is still projected, so nothing about inspectability is lost.
    expect(view.proposals.map((p) => p.id)).toEqual(["p1"]);
  });

  it("keeps a proposal with no owning message in the detached list", () => {
    const action = {
      id: "p9",
      label: "Search",
      explanation: "no prose came with it",
      requiresConfirmation: true,
      tool: { type: "search_web" as const, queries: ["q"], purpose: "p" },
    };

    const view = presentWorkspaceAgent(
      stateWith({ proposals: [{ action, status: "proposed", selectedItemKeys: ["query-0"] }] }),
      [WORKSPACE],
      null,
      null,
      CARDS,
    );

    expect(view.detachedProposals.map((p) => p.id)).toEqual(["p9"]);
  });

  it("renders an empty proposal list as plain conversation — no action chrome", () => {
    const view = presentWorkspaceAgent(
      stateWith({ messages: [reply({ sentContext })], proposals: [] }),
      [WORKSPACE],
      null,
      null,
      CARDS,
    );

    expect(view.messages[0].proposals).toEqual([]);
    expect(view.proposals).toEqual([]);
    expect(view.detachedProposals).toEqual([]);
  });
});
