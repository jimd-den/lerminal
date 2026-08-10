import { describe, expect, it } from "bun:test";
import { Card, createCard } from "../../../entities/card";
import { AgentToolIntent } from "../../../entities/workspaceAgent";
import { BridgeWorkflow, StationDraft } from "../BridgeWorkflow";
import { MemoryBridgeRepository } from "../../../adapters/repositories/MemoryBridgeRepository";
import { WorkspacePulseObservation } from "../../workspaceAgent/observeWorkspace";

const NOW = 1_700_000_000_000;

function card(overrides: Partial<Card> = {}): Card {
  return {
    ...createCard({ workspaceId: "w1", type: "note", title: "A note", body: "body" }),
    ...overrides,
  };
}

interface Harness {
  workflow: BridgeWorkflow;
  dispatched: AgentToolIntent[];
  replies: string[];
  turnCount: () => number;
  setNow: (value: number) => void;
}

/**
 * A workflow wired to fakes. `replies` is a queue: each model-backed watch shifts the next
 * one, so a test states exactly what its stations are told and nothing is left to chance.
 */
function harness(
  options: {
    cards?: Card[];
    replies?: string[];
    observation?: WorkspacePulseObservation | null;
    apiKey?: string;
    dispatch?: (tool: AgentToolIntent) => Promise<string>;
  } = {}
): Harness {
  const dispatched: AgentToolIntent[] = [];
  const replies = [...(options.replies ?? [])];
  let turns = 0;
  let now = NOW;
  let ids = 0;

  const workflow = new BridgeWorkflow({
    host: {
      onChange: () => {},
      activeWorkspaceId: () => "w1",
      cards: () => options.cards ?? [],
      apiKey: () => options.apiKey ?? "key",
      model: () => "test-model",
    },
    repo: new MemoryBridgeRepository(),
    agentGateway: {
      ask: async () => ({ cards: [], isLocalFallback: true }),
      fetchModels: async () => [],
      designWorkspaceAgentTurn: async () => {
        turns += 1;
        const text = replies.shift();
        if (text === undefined) throw new Error("no reply queued");
        return { text };
      },
    } as any,
    observe: () => options.observation ?? null,
    dispatchTool: options.dispatch
      ? async tool => {
          dispatched.push(tool);
          return options.dispatch!(tool);
        }
      : async tool => {
          dispatched.push(tool);
          return "Logged 1 card.";
        },
    now: () => now,
    generateId: () => `id-${++ids}`,
  });

  return {
    workflow,
    dispatched,
    replies,
    turnCount: () => turns,
    setNow: value => {
      now = value;
    },
  };
}

const draft = (overrides: Partial<StationDraft> = {}): StationDraft => ({
  name: "",
  duty: "science",
  subject: "Eigenvectors",
  watch: { kind: "standing" },
  depthCap: 0,
  ...overrides,
});

describe("commissioning", () => {
  it("puts a post on watch and reports at once, so the control visibly lands", async () => {
    const h = harness({ replies: ["[[note: Linear maps | They come first.]]"] });
    await h.workflow.open("w1");

    const station = await h.workflow.commission(draft());

    expect(station).not.toBeNull();
    expect(h.workflow.state.stations).toHaveLength(1);
    expect(h.turnCount()).toBe(1);
    expect(h.workflow.state.contacts).toHaveLength(1);
  });

  it("refuses a subject-less station rather than crewing a post with nothing to watch", async () => {
    const h = harness();
    await h.workflow.open("w1");

    const station = await h.workflow.commission(draft({ subject: "  " }));

    expect(station).toBeNull();
    expect(h.workflow.state.stations).toHaveLength(0);
    expect(h.workflow.state.error).toBeTruthy();
  });

  it("crews a deterministic post with no subject and no model call", async () => {
    const h = harness({
      cards: [card({ id: "a" })],
      observation: {
        kind: "unlinked-note-cluster",
        message: "4 notes are sitting ungrouped at the top level.",
        cardIds: ["a"],
      },
    });
    await h.workflow.open("w1");

    await h.workflow.commission(draft({ duty: "sensors", subject: "" }));

    expect(h.turnCount()).toBe(0);
    expect(h.workflow.state.contacts).toHaveLength(1);
  });
});

describe("a watch raises readings, never changes", () => {
  it("dispatches nothing at all, however many contacts it raises", async () => {
    const h = harness({ replies: ["[[note: Linear maps | They come first.]]"] });
    await h.workflow.open("w1");
    await h.workflow.commission(draft());

    // The invariant: parsing, assembling, and raising a contact create nothing.
    expect(h.dispatched).toHaveLength(0);
  });

  it("dispatches only when the captain gives the order", async () => {
    const h = harness({ replies: ["[[note: Linear maps | They come first.]]"] });
    await h.workflow.open("w1");
    await h.workflow.commission(draft());

    const contact = h.workflow.state.contacts[0];
    const order = contact.orders.find(o => o.intent)!;
    await h.workflow.giveOrder(contact.id, order.id);

    expect(h.dispatched).toHaveLength(1);
    expect(h.dispatched[0].type).toBe("create_cards");
  });

  it("refuses the same order twice", async () => {
    const h = harness({ replies: ["[[note: Linear maps | They come first.]]"] });
    await h.workflow.open("w1");
    await h.workflow.commission(draft());

    const contact = h.workflow.state.contacts[0];
    const order = contact.orders.find(o => o.intent)!;
    await h.workflow.giveOrder(contact.id, order.id);
    await h.workflow.giveOrder(contact.id, order.id);

    expect(h.dispatched).toHaveLength(1);
  });

  it("records a truthful failure and changes nothing when a dispatch fails", async () => {
    const h = harness({
      replies: ["[[note: Linear maps | They come first.]]"],
      dispatch: async () => {
        throw new Error("The card store is unreachable.");
      },
    });
    await h.workflow.open("w1");
    await h.workflow.commission(draft());

    const contact = h.workflow.state.contacts[0];
    const order = contact.orders.find(o => o.intent)!;
    await h.workflow.giveOrder(contact.id, order.id);

    const settled = h.workflow.state.contacts.find(c => c.id === contact.id)!;
    const settledOrder = settled.orders.find(o => o.id === order.id)!;
    expect(settledOrder.state).toBe("failed");
    expect(settledOrder.outcome).toBe("The card store is unreachable.");
    // Still open: a failed order is not a resolved reading.
    expect(settled.state).toBe("acknowledged");
  });
});

describe("a fruitless or fouled watch", () => {
  it("raises nothing when the model returns nothing usable", async () => {
    // An empty scope is a true reading; an empty contact would be noise the captain has
    // to interpret.
    const h = harness({ replies: ["   "] });
    await h.workflow.open("w1");
    await h.workflow.commission(draft());

    expect(h.workflow.state.contacts).toHaveLength(0);
    expect(h.workflow.state.stations[0].lastError).toBeUndefined();
  });

  it("puts a failure on the station, not on the scope", async () => {
    const h = harness({ apiKey: "" });
    await h.workflow.open("w1");
    await h.workflow.commission(draft());

    expect(h.workflow.state.contacts).toHaveLength(0);
    expect(h.workflow.state.stations[0].lastError).toContain("API key");
  });

  it("clears a station's fault when it is put back on watch", async () => {
    const h = harness({ apiKey: "" });
    await h.workflow.open("w1");
    await h.workflow.commission(draft());

    await h.workflow.resume(h.workflow.state.stations[0].id);

    expect(h.workflow.state.stations[0].lastError).toBeUndefined();
  });
});

describe("repetition is escalation, not duplication", () => {
  it("bumps the same outstanding reading instead of raising a copy", async () => {
    const observation: WorkspacePulseObservation = {
      kind: "unlinked-note-cluster",
      message: "4 notes are sitting ungrouped at the top level.",
      cardIds: ["a"],
    };
    const h = harness({ cards: [card({ id: "a" })], observation });
    await h.workflow.open("w1");
    const station = await h.workflow.commission(draft({ duty: "sensors", subject: "" }));

    await h.workflow.runWatch(station!.id);
    await h.workflow.runWatch(station!.id);

    expect(h.workflow.state.contacts).toHaveLength(1);
    expect(h.workflow.state.contacts[0].raised).toBe(2);
  });

  it("raises a genuinely new contact once the captain has cleared the old one", async () => {
    const observation: WorkspacePulseObservation = {
      kind: "unlinked-note-cluster",
      message: "4 notes are sitting ungrouped at the top level.",
      cardIds: ["a"],
    };
    const h = harness({ cards: [card({ id: "a" })], observation });
    await h.workflow.open("w1");
    const station = await h.workflow.commission(draft({ duty: "sensors", subject: "" }));

    await h.workflow.dismissContact(h.workflow.state.contacts[0].id);
    await h.workflow.runWatch(station!.id);

    // Finding it again after a dismissal is new information, not a duplicate.
    const live = h.workflow.state.contacts.filter(c => c.state !== "dismissed");
    expect(live).toHaveLength(1);
  });
});

describe("bounded recursion", () => {
  it("does not expand on its own when the station has no depth to spend", async () => {
    const h = harness({ replies: ["[[note: Linear maps | They come first.]]"] });
    await h.workflow.open("w1");
    await h.workflow.commission(draft({ depthCap: 0 }));

    expect(h.turnCount()).toBe(1);
    expect(h.workflow.state.contacts).toHaveLength(1);
  });

  it("follows its own finding one level down when it has depth, then stops", async () => {
    const h = harness({
      replies: [
        "[[note: Linear maps | They come first.]]",
        "[[note: Vector spaces | And those come first.]]",
        "[[note: Sets | And those.]]",
      ],
    });
    await h.workflow.open("w1");
    await h.workflow.commission(draft({ depthCap: 1 }));

    // Exactly two watches: the commissioning one, and one level of automatic expansion.
    expect(h.turnCount()).toBe(2);
    expect(h.workflow.state.contacts).toHaveLength(2);
    const child = h.workflow.state.contacts.find(c => c.parentContactId !== null)!;
    expect(child.depth).toBe(1);
  });
});

describe("dismissal", () => {
  it("clears a reading and everything expanded from it", async () => {
    const h = harness({
      replies: [
        "[[note: Linear maps | They come first.]]",
        "[[note: Vector spaces | And those come first.]]",
      ],
    });
    await h.workflow.open("w1");
    await h.workflow.commission(draft({ depthCap: 1 }));

    const root = h.workflow.state.contacts.find(c => c.parentContactId === null)!;
    await h.workflow.dismissContact(root.id);

    expect(h.workflow.state.contacts.every(c => c.state === "dismissed")).toBe(true);
  });
});

describe("the situation strip", () => {
  it("is counted from cards and needs no model, no key, and no station", async () => {
    const h = harness({
      apiKey: "",
      cards: [
        card({ id: "a" }),
        card({ id: "b", type: "question", answer: "" }),
        card({ id: "c", schedule: { dueAt: NOW - 1000, interval: 1, reps: 1 } }),
      ],
    });

    await h.workflow.open("w1");

    expect(h.workflow.state.situation.total).toBe(3);
    expect(h.workflow.state.situation.openQuestions).toBe(1);
    expect(h.workflow.state.situation.due).toBe(1);
    expect(h.turnCount()).toBe(0);
  });
});

describe("switching ships", () => {
  it("clears the panel rather than leaving another workspace's readings on it", async () => {
    const h = harness({ replies: ["[[note: Linear maps | They come first.]]"] });
    await h.workflow.open("w1");
    await h.workflow.commission(draft());
    expect(h.workflow.state.contacts).toHaveLength(1);

    await h.workflow.open("w2");

    expect(h.workflow.state.contacts).toHaveLength(0);
    expect(h.workflow.state.stations).toHaveLength(0);
  });
});
