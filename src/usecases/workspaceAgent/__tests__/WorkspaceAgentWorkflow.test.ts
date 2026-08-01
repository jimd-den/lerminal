import { describe, expect, it } from "bun:test";
import {
  contextCardIds,
  WorkspaceAgentContext,
  WorkspaceAgentHost,
  WorkspaceAgentWorkflow,
} from "../WorkspaceAgentWorkflow";
import { AgentGateway } from "../../ports/gateways/AgentGateway";
import { Card } from "../../../entities/card";

class RecordingHost implements WorkspaceAgentHost {
  changes = 0;
  constructor(
    private key = "",
    private modelId = "test/model",
    private cards: Card[] = []
  ) {}
  onChange(): void {
    this.changes += 1;
  }
  apiKey() {
    return this.key;
  }
  model() {
    return this.modelId;
  }
  systemPrompt() {
    return "test system prompt";
  }
  allCards() {
    return this.cards;
  }
}

/** Stands in for any gateway/network dependency the workflow must never touch unexpectedly. */
class GatewaySpy implements AgentGateway {
  calls: string[] = [];
  turnCalls = 0;

  constructor(
    private turn: unknown = { message: "ok", proposedActions: [] },
    private failure?: Error
  ) {}

  async ask(): Promise<never> {
    this.calls.push("ask");
    throw new Error("should never be called by the workspace agent");
  }
  async fetchModels() {
    return [];
  }
  briefings: string[] = [];

  /** Set to hand back citations as if the provider's search had really run. */
  citations: { url: string; title: string }[] = [];
  webSearchFlags: (boolean | undefined)[] = [];

  async designWorkspaceAgentTurn(input: {
    briefing: string;
    webSearchEnabled?: boolean;
  }) {
    this.turnCalls += 1;
    this.briefings.push(input.briefing);
    this.webSearchFlags.push(input.webSearchEnabled);
    if (this.failure) throw this.failure;
    return {
      raw: this.turn,
      webCitations: [...this.citations],
      ...(this.reasoning ? { reasoning: this.reasoning } : {}),
    };
  }

  /** Set to simulate a reasoning-capable model; left unset, no reasoning comes back. */
  reasoning?: string;

  /** Replaces the turn a later `sendMessage` will get back. */
  setTurn(turn: unknown): void {
    this.turn = turn;
  }
}

/** A gateway with no workspace-agent support at all, like an older or mocked one. */
class BareGateway implements AgentGateway {
  async ask() {
    return { cards: [], isLocalFallback: false };
  }
  async fetchModels() {
    return [];
  }
}

const card = (id: string): Card => ({
  id,
  workspaceId: "w1",
  type: "note",
  title: `Card ${id}`,
  body: "body",
  createdAt: 0,
  tags: [],
});

describe("WorkspaceAgentWorkflow", () => {
  it("starts closed with no messages and no proposals", () => {
    const workflow = new WorkspaceAgentWorkflow({ host: new RecordingHost() });
    expect(workflow.state.isOpen).toBe(false);
    expect(workflow.state.messages).toEqual([]);
    expect(workflow.state.proposals).toEqual([]);
  });

  it("opening the sheet touches no gateway and sets context", () => {
    const host = new RecordingHost();
    const workflow = new WorkspaceAgentWorkflow({ host });

    workflow.openConversation("w1", { selectedCardIds: ["c1", "c2"], currentGroupId: "g1" });

    expect(workflow.state.isOpen).toBe(true);
    expect(workflow.state.workspaceId).toBe("w1");
    expect(workflow.state.context).toEqual({ selectedCardIds: ["c1", "c2"], currentGroupId: "g1" });
    expect(host.changes).toBeGreaterThan(0);
  });

  it("closing resets to the empty session (messages/proposals are session-only)", async () => {
    const workflow = new WorkspaceAgentWorkflow({ host: new RecordingHost() });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });
    await workflow.sendMessage("hello");
    expect(workflow.state.messages).toHaveLength(1);

    workflow.closeConversation();

    expect(workflow.state.isOpen).toBe(false);
    expect(workflow.state.messages).toEqual([]);
    expect(workflow.state.proposals).toEqual([]);
    expect(workflow.state.workspaceId).toBeNull();
  });

  it("ignores blank messages and messages sent while closed", async () => {
    const workflow = new WorkspaceAgentWorkflow({ host: new RecordingHost() });
    await workflow.sendMessage("nobody's listening");
    expect(workflow.state.messages).toEqual([]);

    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });
    await workflow.sendMessage("   ");
    expect(workflow.state.messages).toEqual([]);
  });

  it("sending a message without an API key produces a failure state, no cards, no other interactor", async () => {
    const gateway = new GatewaySpy();
    const host = new RecordingHost("", "test/model");
    const workflow = new WorkspaceAgentWorkflow({
      host,
      agentGateway: gateway,
      now: () => 1000,
      generateId: () => "msg-1",
    });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("what's going on here?");

    expect(workflow.state.messages).toEqual([
      { id: "msg-1", speaker: "user", text: "what's going on here?", createdAt: 1000, pending: true },
    ]);
    expect(workflow.state.agentError).toBeTruthy();
    expect(workflow.state.proposals).toEqual([]);
    expect(gateway.calls).toEqual([]);
    expect(gateway.turnCalls).toBe(0);
  });

  it("a gateway with no workspace-agent support produces a clear failure state", async () => {
    const host = new RecordingHost("sk-real-key");
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: new BareGateway() });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("hello");

    expect(workflow.state.agentError).toBeTruthy();
    expect(workflow.state.proposals).toEqual([]);
  });

  it("a mocked gateway returning malformed JSON causes no side effects", async () => {
    const gateway = new GatewaySpy({ notAValidShape: true });
    const host = new RecordingHost("sk-real-key");
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("group my notes");

    expect(workflow.state.agentError).toBeTruthy();
    expect(workflow.state.proposals).toEqual([]);
    // The user's message stays recorded either way — nothing is lost on a bad reply.
    expect(workflow.state.messages).toHaveLength(1);
  });

  it("a mocked gateway returning an unknown tool type or an out-of-scope card id is rejected", async () => {
    const gateway = new GatewaySpy({
      message: "ok",
      proposedActions: [
        {
          id: "p1",
          label: "Do a thing",
          explanation: "because",
          tool: { type: "delete_everything" },
        },
      ],
    });
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    workflow.openConversation("w1", { selectedCardIds: ["c1"], currentGroupId: null });

    await workflow.sendMessage("do something");

    expect(workflow.state.agentError).toBeTruthy();
    expect(workflow.state.proposals).toEqual([]);
  });

  it("a mocked gateway returning a valid response stores proposals unexecuted", async () => {
    const cards = [card("c1"), card("c2")];
    const gateway = new GatewaySpy({
      message: "Here's what I'd do.",
      proposedActions: [
        {
          id: "p1",
          label: "Group these",
          explanation: "They're related",
          requiresConfirmation: true,
          tool: { type: "create_group", name: "New group", cardIds: ["c1", "c2"] },
        },
      ],
    });
    const host = new RecordingHost("sk-real-key", "test/model", cards);
    const workflow = new WorkspaceAgentWorkflow({
      host,
      agentGateway: gateway,
      now: () => 2000,
      generateId: () => "msg-2",
    });
    workflow.openConversation("w1", { selectedCardIds: ["c1", "c2"], currentGroupId: null });

    await workflow.sendMessage("group my notes");

    expect(workflow.state.agentError).toBeNull();
    expect(workflow.state.messages.some(m => m.speaker === "assistant" && m.text === "Here's what I'd do.")).toBe(true);
    expect(workflow.state.proposals).toHaveLength(1);
    expect(workflow.state.proposals[0].status).toBe("proposed");
    expect(workflow.state.proposals[0].action.tool).toEqual({
      type: "create_group",
      name: "New group",
      cardIds: ["c1", "c2"],
    });
    // Nothing was actually grouped — no dispatch in Phase C.
    expect(gateway.calls).toEqual([]);
  });

  it("a proposal is never executed merely by being proposed — only dispatchTool triggers it, and only on confirm", async () => {
    const gateway = new GatewaySpy({
      message: "ok",
      proposedActions: [
        {
          id: "p1",
          label: "Extract",
          explanation: "This source has a link",
          tool: { type: "extract_url", cardId: "c1" },
        },
      ],
    });
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const dispatchCalls: Array<{ tool: any; context: any }> = [];
    const workflow = new WorkspaceAgentWorkflow({
      host,
      agentGateway: gateway,
      dispatchTool: async (tool, context) => {
        dispatchCalls.push({ tool, context });
        return "Extracted the link.";
      },
    });
    workflow.openConversation("w1", { selectedCardIds: ["c1"], currentGroupId: null });
    await workflow.sendMessage("extract it");

    // Sending the message and receiving the proposal must not dispatch anything.
    expect(dispatchCalls).toHaveLength(0);
    expect(workflow.state.proposals[0].status).toBe("proposed");

    const confirmPromise = workflow.confirmProposal("p1");
    // Immediately after calling confirm (before the dispatch settles), status flips to
    // pending-dispatch so the UI can disable the control while work is in flight.
    expect(workflow.state.proposals[0].status).toBe("pending-dispatch");

    await confirmPromise;

    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0].tool).toEqual({ type: "extract_url", cardId: "c1" });
    expect(workflow.state.proposals[0].status).toBe("done");
    expect(workflow.state.proposals[0].resultMessage).toBe("Extracted the link.");
  });

  it("surfaces a truthful failure message and terminal status when dispatch throws", async () => {
    const gateway = new GatewaySpy({
      message: "ok",
      proposedActions: [
        {
          id: "p1",
          label: "Group",
          explanation: "These go together",
          tool: { type: "create_group", name: "New group", cardIds: ["c1"] },
        },
      ],
    });
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({
      host,
      agentGateway: gateway,
      dispatchTool: async () => {
        throw new Error("Grouping failed. Your notes are unchanged.");
      },
    });
    workflow.openConversation("w1", { selectedCardIds: ["c1"], currentGroupId: null });
    await workflow.sendMessage("group these");

    await workflow.confirmProposal("p1");

    expect(workflow.state.proposals[0].status).toBe("failed");
    expect(workflow.state.proposals[0].resultMessage).toBe(
      "Grouping failed. Your notes are unchanged.",
    );
  });
});

/**
 * The context the agent talks about must be what is on screen when the user hits send —
 * not a snapshot from when they opened the sheet. These cover the "tap a card → Ask GRIOT
 * → explain this" flow, which used to send zero card context.
 */
describe("WorkspaceAgentWorkflow live context", () => {
  const richCard = (id: string, body: string): Card => ({
    id,
    workspaceId: "w1",
    type: "note",
    title: `Title ${id}`,
    body,
    createdAt: 0,
    tags: [],
  });

  class LiveHost extends RecordingHost {
    context: WorkspaceAgentContext = { selectedCardIds: [], currentGroupId: null };
    currentContext(): WorkspaceAgentContext {
      return this.context;
    }
  }

  const setup = (cards: Card[]) => {
    const gateway = new GatewaySpy({ message: "ok", proposedActions: [] });
    const host = new LiveHost("sk-real-key", "test/model", cards);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    return { gateway, host, workflow };
  };

  it("sends the selection as it is at send time, not as it was at open time", async () => {
    const cards = [richCard("c1", "STALE BODY"), richCard("c2", "FRESH BODY")];
    const { gateway, host, workflow } = setup(cards);

    host.context = { selectedCardIds: ["c1"], currentGroupId: null };
    workflow.openConversation("w1", host.context);

    // The user changes their mind while the sheet is open.
    host.context = { selectedCardIds: ["c2"], currentGroupId: null };
    await workflow.sendMessage("explain this");

    // c1 may still appear as a same-group sibling, but the *focus* — what "this" means —
    // must have moved to c2, and c2 must lead the briefing.
    const briefing = gateway.briefings.at(-1)!;
    expect(briefing).toContain("[c2] [focus] (note) Title c2: FRESH BODY");
    expect(briefing).not.toContain("[c1] [focus]");
    expect(briefing.indexOf("FRESH BODY")).toBeLessThan(briefing.indexOf("STALE BODY"));
    expect(workflow.state.context.selectedCardIds).toEqual(["c2"]);
  });

  it("includes the currently open card even with no multi-selection", async () => {
    const cards = [richCard("c1", "OPEN CARD BODY")];
    const { gateway, host, workflow } = setup(cards);

    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });
    host.context = { selectedCardIds: [], currentGroupId: null, openCardId: "c1" };

    await workflow.sendMessage("explain this");

    const briefing = gateway.briefings.at(-1)!;
    expect(briefing).toContain("OPEN CARD BODY");
    expect(briefing).toContain("[c1] [focus]");
  });

  it("includes the open card and the selection together, de-duplicated", async () => {
    const cards = [richCard("c1", "OPEN BODY"), richCard("c2", "SELECTED BODY")];
    const { gateway, host, workflow } = setup(cards);

    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });
    host.context = { selectedCardIds: ["c1", "c2"], currentGroupId: null, openCardId: "c1" };

    await workflow.sendMessage("compare these");

    expect(contextCardIds(workflow.state.context)).toEqual(["c1", "c2"]);
    const briefing = gateway.briefings.at(-1)!;
    expect(briefing).toContain("OPEN BODY");
    expect(briefing).toContain("SELECTED BODY");
    expect(briefing.match(/\[c1\]/g)).toHaveLength(1);
  });

  it("keeps focused cards in the briefing when the workspace has far more cards than the budget", async () => {
    const noise = Array.from({ length: 60 }, (_, i) => richCard(`n${i}`, `NOISE ${i}`));
    const focus = richCard("focus", "FOCUS BODY");
    const { gateway, host, workflow } = setup([...noise, focus]);

    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });
    host.context = { selectedCardIds: [], currentGroupId: null, openCardId: "focus" };

    await workflow.sendMessage("explain this");

    expect(gateway.briefings.at(-1)!).toContain("FOCUS BODY");
  });

  it("falls back to the opened-with context when the host offers no live context", async () => {
    const cards = [richCard("c1", "SNAPSHOT BODY")];
    const gateway = new GatewaySpy({ message: "ok", proposedActions: [] });
    const host = new RecordingHost("sk-real-key", "test/model", cards);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });

    workflow.openConversation("w1", { selectedCardIds: ["c1"], currentGroupId: null });
    await workflow.sendMessage("explain this");

    expect(gateway.briefings.at(-1)!).toContain("SNAPSHOT BODY");
  });
});

/**
 * Per-item selection: a proposal of eight cards should not be an all-or-nothing bet. The
 * selection lives here in the use case (never in a component), toggling is inert, and
 * confirming dispatches an intent narrowed to exactly what the user kept.
 */
describe("WorkspaceAgentWorkflow proposal item selection", () => {
  const setup = (tool: any, cards: Card[] = [card("c1"), card("c2"), card("c3")]) => {
    const gateway = new GatewaySpy({
      message: "Here's what I'd do.",
      proposedActions: [
        { id: "p1", label: "Do it", explanation: "because", tool },
      ],
    });
    const host = new RecordingHost("sk-real-key", "test/model", cards);
    const dispatched: any[] = [];
    const workflow = new WorkspaceAgentWorkflow({
      host,
      agentGateway: gateway,
      dispatchTool: async (t) => {
        dispatched.push(t);
        return t.type === "create_cards"
          ? `Created ${t.cards.length} cards.`
          : `Grouped ${(t as any).cardIds?.length ?? 0} notes.`;
      },
    });
    return { workflow, dispatched };
  };

  const open = async (workflow: WorkspaceAgentWorkflow) => {
    workflow.openConversation("w1", { selectedCardIds: ["c1", "c2", "c3"], currentGroupId: null });
    await workflow.sendMessage("do the thing");
  };

  it("starts with every proposed item selected", async () => {
    const { workflow } = setup({
      type: "create_cards",
      cards: [
        { type: "note", title: "A", body: "a" },
        { type: "note", title: "B", body: "b" },
      ],
    });
    await open(workflow);

    expect(workflow.state.proposals[0].selectedItemKeys).toEqual(["card-0", "card-1"]);
    expect(workflow.canConfirmProposal("p1")).toBe(true);
  });

  it("leaves single-target intents with no selection state at all", async () => {
    const { workflow } = setup({ type: "extract_url", cardId: "c1" });
    await open(workflow);

    expect(workflow.state.proposals[0].selectedItemKeys).toBeUndefined();
    expect(workflow.canConfirmProposal("p1")).toBe(true);
  });

  it("toggling an item dispatches nothing", async () => {
    const { workflow, dispatched } = setup({
      type: "create_group",
      name: "Cluster",
      cardIds: ["c1", "c2", "c3"],
    });
    await open(workflow);

    workflow.toggleProposalItem("p1", "c2");
    workflow.toggleProposalItem("p1", "c3");

    expect(dispatched).toEqual([]);
    expect(workflow.state.proposals[0].status).toBe("proposed");
    expect(workflow.state.proposals[0].selectedItemKeys).toEqual(["c1"]);
  });

  it("re-checking an item restores it in the order the agent proposed", async () => {
    const { workflow } = setup({
      type: "create_group",
      name: "Cluster",
      cardIds: ["c1", "c2", "c3"],
    });
    await open(workflow);

    workflow.toggleProposalItem("p1", "c1");
    expect(workflow.state.proposals[0].selectedItemKeys).toEqual(["c2", "c3"]);
    workflow.toggleProposalItem("p1", "c1");
    expect(workflow.state.proposals[0].selectedItemKeys).toEqual(["c1", "c2", "c3"]);
  });

  it("confirming after unchecking dispatches the NARROWED intent, and the message reflects it", async () => {
    const { workflow, dispatched } = setup({
      type: "create_cards",
      cards: [
        { type: "note", title: "A", body: "a" },
        { type: "note", title: "B", body: "b" },
        { type: "note", title: "C", body: "c" },
      ],
    });
    await open(workflow);

    workflow.toggleProposalItem("p1", "card-1");
    await workflow.confirmProposal("p1");

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({
      type: "create_cards",
      cards: [
        { type: "note", title: "A", body: "a" },
        { type: "note", title: "C", body: "c" },
      ],
    });
    // Truthful: two, not the three that were proposed.
    expect(workflow.state.proposals[0].resultMessage).toBe("Created 2 cards.");
    expect(workflow.state.proposals[0].status).toBe("done");
  });

  it("confirming a pruned create_group dispatches only the kept card ids", async () => {
    const { workflow, dispatched } = setup({
      type: "create_group",
      name: "Cluster",
      cardIds: ["c1", "c2", "c3"],
    });
    await open(workflow);

    workflow.toggleProposalItem("p1", "c2");
    await workflow.confirmProposal("p1");

    expect(dispatched[0]).toEqual({
      type: "create_group",
      name: "Cluster",
      cardIds: ["c1", "c3"],
    });
    expect(workflow.state.proposals[0].resultMessage).toBe("Grouped 2 notes.");
  });

  it("unchecking everything disables confirm and refuses to dispatch", async () => {
    const { workflow, dispatched } = setup({
      type: "create_group",
      name: "Cluster",
      cardIds: ["c1", "c2"],
    });
    await open(workflow);

    workflow.toggleProposalItem("p1", "c1");
    workflow.toggleProposalItem("p1", "c2");

    expect(workflow.canConfirmProposal("p1")).toBe(false);

    await workflow.confirmProposal("p1");

    // No empty group was ever created, and the proposal stays confirmable once the user
    // re-checks something — it isn't stranded in a terminal state.
    expect(dispatched).toEqual([]);
    expect(workflow.state.proposals[0].status).toBe("proposed");
  });

  it("ignores toggles for unknown proposals, unknown items, and already-confirmed proposals", async () => {
    const { workflow, dispatched } = setup({
      type: "search_web",
      queries: ["good", "bad"],
      purpose: "why",
    });
    await open(workflow);

    workflow.toggleProposalItem("nope", "query-0");
    workflow.toggleProposalItem("p1", "query-99");
    expect(workflow.state.proposals[0].selectedItemKeys).toEqual(["query-0", "query-1"]);

    workflow.toggleProposalItem("p1", "query-1");
    await workflow.confirmProposal("p1");
    expect(dispatched[0]).toEqual({ type: "search_web", queries: ["good"], purpose: "why" });

    // Post-confirm toggles must not rewrite what was dispatched.
    workflow.toggleProposalItem("p1", "query-1");
    expect(workflow.state.proposals[0].selectedItemKeys).toEqual(["query-0"]);
  });
});

describe("WorkspaceAgentWorkflow plain conversation", () => {
  it("a reply with no proposals is a normal turn: message shown, nothing proposed, no error", async () => {
    const gateway = new GatewaySpy({ message: "They mostly circle one question.", proposedActions: [] });
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    workflow.openConversation("w1", { selectedCardIds: ["c1"], currentGroupId: null });

    await workflow.sendMessage("what do you make of these notes?");

    expect(workflow.state.agentError).toBeNull();
    expect(workflow.state.proposals).toEqual([]);
    expect(workflow.state.messages.at(-1)).toMatchObject({
      speaker: "assistant",
      text: "They mostly circle one question.",
    });
    expect(workflow.state.messages.every(m => !m.pending)).toBe(true);
  });

  it("a reply with the proposedActions key absent is equally valid", async () => {
    const gateway = new GatewaySpy({ message: "Yes — for two reasons." });
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("is this a good idea?");

    expect(workflow.state.agentError).toBeNull();
    expect(workflow.state.proposals).toEqual([]);
    expect(workflow.state.messages.at(-1)!.text).toBe("Yes — for two reasons.");
  });

  describe("provider web citations as receipts", () => {
    it("attaches real citations to the reply that used them", async () => {
      const gateway = new GatewaySpy({ message: "Two papers disagree.", proposedActions: [] });
      gateway.citations = [{ url: "https://a.example", title: "A paper" }];
      const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
      const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
      workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

      await workflow.sendMessage("what does the literature say?");

      const reply = workflow.state.messages.at(-1)!;
      expect(reply.speaker).toBe("assistant");
      expect(reply.webCitations).toEqual([{ url: "https://a.example", title: "A paper" }]);
      // The user's own message never carries receipts.
      expect(workflow.state.messages[0].webCitations).toBeUndefined();
    });

    it("claims nothing when the search returned no citations", async () => {
      // The toggle being on is not evidence: the search can run and find nothing, or the
      // model can answer without invoking it at all.
      const gateway = new GatewaySpy({ message: "From your own notes only.", proposedActions: [] });
      gateway.citations = [];
      const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
      const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
      workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

      await workflow.sendMessage("what does the literature say?");

      expect(workflow.state.messages.at(-1)!.webCitations).toBeUndefined();
    });

    it("does not let one turn's sources bleed into the next", async () => {
      const gateway = new GatewaySpy({ message: "First.", proposedActions: [] });
      gateway.citations = [{ url: "https://a.example", title: "A paper" }];
      const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
      const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
      workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

      await workflow.sendMessage("first question");
      gateway.citations = [];
      await workflow.sendMessage("second question");

      const replies = workflow.state.messages.filter(m => m.speaker === "assistant");
      expect(replies[0].webCitations).toHaveLength(1);
      expect(replies[1].webCitations).toBeUndefined();
    });

    it("passes the host's web-search preference through to the gateway", async () => {
      const gateway = new GatewaySpy({ message: "ok", proposedActions: [] });
      const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
      (host as any).webSearchEnabled = () => false;
      const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
      workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

      await workflow.sendMessage("hi");

      expect(gateway.webSearchFlags).toEqual([false]);
    });

    it("leaves the flag undefined — meaning on — when the host has no preference", async () => {
      const gateway = new GatewaySpy({ message: "ok", proposedActions: [] });
      const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
      const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
      workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

      await workflow.sendMessage("hi");

      expect(gateway.webSearchFlags).toEqual([undefined]);
    });
  });
});

/**
 * The disclosure's whole value is that it is an audit record, not a summary. These pin
 * the two ways it could lie: claiming context that never travelled, and implying the
 * model reasoned when it merely answered.
 */
describe("WorkspaceAgentWorkflow turn transparency", () => {
  const proposal = (id: string, title: string) => ({
    id,
    label: `Create ${title}`,
    explanation: "why",
    tool: { type: "create_cards", cards: [{ type: "note", title, body: "b" }] },
  });

  it("records exactly the cards that were sent, and the verbatim briefing", async () => {
    const cards = [card("c1"), card("c2"), card("c3")];
    const gateway = new GatewaySpy({ message: "here you go", proposedActions: [] });
    const host = new RecordingHost("sk-real-key", "test/model", cards);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    workflow.openConversation("w1", { selectedCardIds: ["c2"], currentGroupId: null });

    await workflow.sendMessage("explain this");

    const sent = workflow.state.messages.at(-1)!.sentContext!;
    const briefing = gateway.briefings.at(-1)!;

    // No over-claiming: every id in the record really appears in the briefing that left,
    // and every card the briefing listed is in the record.
    for (const id of sent.cardIds) expect(briefing).toContain(`[${id}]`);
    const listed = [...briefing.matchAll(/^- \[([^\]]+)\]/gm)].map(match => match[1]);
    expect(sent.cardIds).toEqual(listed);
    expect(sent.briefing).toBe(briefing);

    // The focus set is exactly `contextCardIds` — what the user had open or selected.
    expect(sent.focusCardIds).toEqual(
      contextCardIds({ selectedCardIds: ["c2"], currentGroupId: null })
    );
    expect(sent.groupId).toBeNull();
  });

  it("attaches real reasoning to the reply that produced it", async () => {
    const gateway = new GatewaySpy({ message: "Answer.", proposedActions: [] });
    gateway.reasoning = "First I checked the two notes, then compared them.";
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("why?");

    const reply = workflow.state.messages.at(-1)!;
    expect(reply.reasoning).toBe("First I checked the two notes, then compared them.");
    // Reasoning is never the answer, and never replaces it.
    expect(reply.text).toBe("Answer.");
  });

  it("stores no reasoning at all when the model returned none", async () => {
    const gateway = new GatewaySpy({ message: "Answer.", proposedActions: [] });
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("why?");

    expect(workflow.state.messages.at(-1)!.reasoning).toBeUndefined();
  });

  it("does not let one turn's reasoning bleed into the next", async () => {
    const gateway = new GatewaySpy({ message: "First.", proposedActions: [] });
    gateway.reasoning = "thought once";
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("one");
    gateway.reasoning = undefined;
    gateway.setTurn({ message: "Second.", proposedActions: [] });
    await workflow.sendMessage("two");

    const replies = workflow.state.messages.filter(m => m.speaker === "assistant");
    expect(replies[0].reasoning).toBe("thought once");
    expect(replies[1].reasoning).toBeUndefined();
  });

  it("associates proposals with the reply that produced them", async () => {
    const gateway = new GatewaySpy({
      message: "Two of these belong together.",
      proposedActions: [proposal("p1", "Alpha")],
    });
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("anything to do here?");

    const reply = workflow.state.messages.at(-1)!;
    expect(reply.proposalIds).toEqual(["p1"]);
    expect(workflow.state.proposals[0].messageId).toBe(reply.id);
  });

  it("two turns with proposals do not cross-attach", async () => {
    const gateway = new GatewaySpy({
      message: "First.",
      proposedActions: [proposal("p1", "Alpha")],
    });
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("one");
    const firstReply = workflow.state.messages.at(-1)!;

    gateway.setTurn({ message: "Second.", proposedActions: [proposal("p2", "Beta")] });
    await workflow.sendMessage("two");
    const secondReply = workflow.state.messages.at(-1)!;

    expect(firstReply.id).not.toBe(secondReply.id);
    expect(firstReply.proposalIds).toEqual(["p1"]);
    expect(secondReply.proposalIds).toEqual(["p2"]);
    // The live proposal belongs to the second reply and to nothing else.
    expect(workflow.state.proposals.map(p => p.action.id)).toEqual(["p2"]);
    expect(workflow.state.proposals[0].messageId).toBe(secondReply.id);
  });

  it("a reply with no proposals carries no proposal ids", async () => {
    const gateway = new GatewaySpy({ message: "Just talking.", proposedActions: [] });
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("hi");

    expect(workflow.state.messages.at(-1)!.proposalIds).toBeUndefined();
  });
});
