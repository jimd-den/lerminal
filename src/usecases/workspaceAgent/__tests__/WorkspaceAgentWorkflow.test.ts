import { describe, expect, it } from "bun:test";
import { WorkspaceAgentHost, WorkspaceAgentWorkflow } from "../WorkspaceAgentWorkflow";
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
  async designWorkspaceAgentTurn() {
    this.turnCalls += 1;
    if (this.failure) throw this.failure;
    return { raw: this.turn };
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
