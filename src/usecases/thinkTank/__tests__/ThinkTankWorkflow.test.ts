import { describe, expect, it } from "bun:test";
import { ThinkTankWorkflow, ThinkTankHost } from "../ThinkTankWorkflow";
import { MemoryConversationRepository } from "../../../adapters/repositories/MemoryConversationRepository";
import { AgentGateway, WorkspaceAgentTurnResult } from "../../ports/gateways/AgentGateway";
import { AgentToolIntent } from "../../../entities/workspaceAgent";
import { AgentVoice } from "../../../entities/agentMessage";
import { Card } from "../../../entities/card";

/**
 * Workflow-level tests: what `GriotController.thinkTank.test.ts` covers end to end, this
 * file covers directly — the invariants that are awkward to reach or slow to set up
 * through the full controller, and the ones worth stating in the workflow's own terms.
 */

const VOICES: AgentVoice[] = [
  { id: "v1", name: "Advocate", model: "m" },
  { id: "v2", name: "Skeptic", model: "m" },
];

class StubGateway implements AgentGateway {
  turnCalls: string[] = [];
  nextText = "A reply.";
  fail = false;

  async ask() {
    return { cards: [], isLocalFallback: true };
  }
  async fetchModels() {
    return [];
  }
  async designWorkspaceAgentTurn(input: { briefing: string }): Promise<WorkspaceAgentTurnResult> {
    this.turnCalls.push(input.briefing);
    if (this.fail) throw new Error("network down");
    return { text: this.nextText, webCitations: [] };
  }
}

function harness(options: { dispatch?: (tool: AgentToolIntent) => Promise<string> } = {}) {
  const gateway = new StubGateway();
  const repo = new MemoryConversationRepository();
  const dispatched: AgentToolIntent[] = [];
  let now = 1_700_000_000_000;
  let ids = 0;

  const host: ThinkTankHost = {
    onChange: () => {},
    apiKey: () => "key",
    model: () => "m",
    allCards: () => [],
  };

  const workflow = new ThinkTankWorkflow({
    host,
    agentGateway: gateway,
    conversationRepo: repo,
    dispatchTool: options.dispatch
      ? tool => {
          dispatched.push(tool);
          return options.dispatch!(tool);
        }
      : async tool => {
          dispatched.push(tool);
          return "Logged.";
        },
    now: () => now,
    generateId: () => `id-${++ids}`,
  });

  return {
    workflow,
    gateway,
    repo,
    dispatched,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("convene", () => {
  it("does nothing with an empty panel", async () => {
    const { workflow } = harness();
    await workflow.open("w1");
    await workflow.convene("rt1", "Empty Table", [], "a topic");
    expect(workflow.state.threads["rt1"]).toBeUndefined();
    expect(workflow.state.activeRoundtableId).toBeNull();
  });

  it("asks every voice once, in order, and each sees the transcript so far", async () => {
    const { workflow, gateway } = harness();
    await workflow.open("w1");
    await workflow.convene("rt1", "The Table", VOICES, "a topic");

    expect(gateway.turnCalls).toHaveLength(2);
    // The second voice's briefing includes the transcript, including the first voice's
    // own reply — the same "sees what came before" the ambient conversation guarantees.
    expect(gateway.turnCalls[1]).toContain("Advocate");
  });
});

describe("the invariant: nothing but addTag changes the workspace", () => {
  it("convening, posting, retrying and rethinking dispatch nothing", async () => {
    const { workflow, dispatched } = harness();
    await workflow.open("w1");
    await workflow.convene("rt1", "The Table", VOICES, "a topic");
    await workflow.post("rt1", "more");

    const reply = workflow.state.threads["rt1"].messages.find(m => m.speaker === "assistant")!;
    await workflow.retryReply("rt1", reply.id);
    await workflow.rethinkReply("rt1", reply.id);

    expect(dispatched).toHaveLength(0);
  });
});

describe("errors are per-thread", () => {
  it("a fouled thread does not block a different one", async () => {
    const { workflow, gateway } = harness();
    await workflow.open("w1");
    await workflow.convene("rt1", "Table One", VOICES, "topic one");

    gateway.fail = true;
    await workflow.post("rt1", "this will fail");
    expect(workflow.state.threads["rt1"].error).toContain("Couldn't reach the model");

    gateway.fail = false;
    await workflow.convene("rt2", "Table Two", VOICES, "topic two");
    expect(workflow.state.threads["rt2"].error).toBeNull();
    expect(workflow.state.threads["rt2"].messages.some(m => m.speaker === "assistant")).toBe(true);
  });

  it("a failed turn drops the half-written reply rather than keeping it", async () => {
    const { workflow, gateway } = harness();
    await workflow.open("w1");
    gateway.fail = true;
    await workflow.convene("rt1", "The Table", [VOICES[0]], "a topic");

    const thread = workflow.state.threads["rt1"];
    expect(thread.messages.some(m => m.speaker === "assistant")).toBe(false);
    // The user's own post survives, un-pending.
    expect(thread.messages.find(m => m.speaker === "user")?.pending).toBe(false);
  });
});

describe("setActive loads a thread never live this session", () => {
  it("restores it purely from the repository, tags re-parsed", async () => {
    const { workflow, repo } = harness();
    await workflow.open("w1");
    await workflow.convene("rt1", "The Table", VOICES, "[[note: A finding | detail]]");

    // A fresh workflow instance over the *same* repository — nothing carried in memory.
    const reopened = new ThinkTankWorkflow({
      host: { onChange: () => {}, apiKey: () => "key", model: () => "m", allCards: () => [] },
      agentGateway: new StubGateway(),
      conversationRepo: repo,
    });
    await reopened.open("w1");
    expect(reopened.state.threads["rt1"]).toBeUndefined();

    await reopened.setActive("rt1");

    expect(reopened.state.activeRoundtableId).toBe("rt1");
    expect(reopened.state.threads["rt1"]).toBeDefined();
    expect(reopened.state.threads["rt1"].messages.length).toBeGreaterThan(0);
  });

  it("does nothing for a roundtable that was never convened", async () => {
    const { workflow } = harness();
    await workflow.open("w1");
    await workflow.setActive("never-existed");
    expect(workflow.state.activeRoundtableId).toBeNull();
  });
});

describe("deleteThread", () => {
  it("deletes a thread that is only in history, never loaded this session", async () => {
    const { workflow, repo } = harness();
    await workflow.open("w1");
    await workflow.convene("rt1", "The Table", VOICES, "a topic");
    workflow.dismiss();

    // Reopen fresh so the thread is history-only, not in `threads`.
    const reopened = new ThinkTankWorkflow({
      host: { onChange: () => {}, apiKey: () => "key", model: () => "m", allCards: () => [] },
      agentGateway: new StubGateway(),
      conversationRepo: repo,
    });
    await reopened.open("w1");
    expect(reopened.state.threads["rt1"]).toBeUndefined();
    expect(reopened.state.history).toHaveLength(1);

    await reopened.deleteThread("rt1");

    expect(reopened.state.history).toHaveLength(0);
    expect(await repo.getConversations("w1")).toHaveLength(0);
  });
});

describe("dismiss", () => {
  it("is a no-op with nothing active", () => {
    const { workflow } = harness();
    expect(() => workflow.dismiss()).not.toThrow();
    expect(workflow.state.activeRoundtableId).toBeNull();
  });
});

describe("switching workspaces", () => {
  it("clears the board rather than showing another workspace's threads", async () => {
    const { workflow } = harness();
    await workflow.open("w1");
    await workflow.convene("rt1", "The Table", VOICES, "a topic");

    await workflow.open("w2");

    expect(workflow.state.threads).toEqual({});
    expect(workflow.state.history).toEqual([]);
    expect(workflow.state.activeRoundtableId).toBeNull();
  });
});
