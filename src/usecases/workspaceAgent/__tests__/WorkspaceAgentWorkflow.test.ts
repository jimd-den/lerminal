import { describe, expect, it } from "bun:test";
import {
  contextCardIds,
  DEFAULT_PERSONA_ID,
  WorkspaceAgentContext,
  WorkspaceAgentHost,
  WorkspaceAgentPersona,
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
    private turn: string = "ok",
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

  /** What each turn was actually sent as — the evidence a persona really took effect. */
  models: string[] = [];
  systemPrompts: (string | undefined)[] = [];

  async designWorkspaceAgentTurn(input: {
    briefing: string;
    model?: string;
    systemPrompt?: string;
    webSearchEnabled?: boolean;
  }) {
    this.turnCalls += 1;
    this.briefings.push(input.briefing);
    this.models.push(input.model ?? "");
    this.systemPrompts.push(input.systemPrompt);
    this.webSearchFlags.push(input.webSearchEnabled);
    if (this.failure) throw this.failure;
    return {
      text: this.turn,
      webCitations: [...this.citations],
      ...(this.reasoning ? { reasoning: this.reasoning } : {}),
    };
  }

  /** Set to simulate a reasoning-capable model; left unset, no reasoning comes back. */
  reasoning?: string;

  /** Replaces the reply text a later `sendMessage` will get back. */
  setTurn(turn: string): void {
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
  it("starts closed with no messages and nothing added", () => {
    const workflow = new WorkspaceAgentWorkflow({ host: new RecordingHost() });
    expect(workflow.state.isOpen).toBe(false);
    expect(workflow.state.messages).toEqual([]);
    expect(workflow.state.tagActions).toEqual({});
  });

  it("opening the sheet touches no gateway and sets context", () => {
    const gateway = new GatewaySpy();
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });

    workflow.openConversation("w1", { selectedCardIds: ["c1"], currentGroupId: null });

    expect(workflow.state.isOpen).toBe(true);
    expect(gateway.turnCalls).toBe(0);
    expect(gateway.calls).toEqual([]);
  });

  it("closing resets to the empty session (messages are session-only)", async () => {
    const gateway = new GatewaySpy("ok");
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });
    await workflow.sendMessage("hello");

    workflow.closeConversation();

    expect(workflow.state.isOpen).toBe(false);
    expect(workflow.state.messages).toEqual([]);
    expect(workflow.state.tagActions).toEqual({});
  });

  it("ignores blank messages and messages sent while closed", async () => {
    const gateway = new GatewaySpy("ok");
    const host = new RecordingHost("sk-real-key", "test/model", []);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });

    await workflow.sendMessage("sent while closed");
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });
    await workflow.sendMessage("   ");

    expect(gateway.turnCalls).toBe(0);
    expect(workflow.state.messages).toEqual([]);
  });

  it("sending a message without an API key produces a failure state, no cards, no other interactor", async () => {
    const gateway = new GatewaySpy("ok");
    const dispatched: unknown[] = [];
    const host = new RecordingHost("", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({
      host,
      agentGateway: gateway,
      dispatchTool: async intent => {
        dispatched.push(intent);
        return "done";
      },
    });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("do something");

    expect(workflow.state.agentError).toBeTruthy();
    expect(gateway.turnCalls).toBe(0);
    expect(dispatched).toEqual([]);
  });

  it("a gateway with no workspace-agent support produces a clear failure state", async () => {
    const host = new RecordingHost("sk-real-key", "test/model", []);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: new BareGateway() });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("hello");

    expect(workflow.state.agentError).toBeTruthy();
  });

  it("a reply whose tag cannot be resolved yields no addable intent and changes nothing", async () => {
    // The tag equivalent of the old malformed-JSON case: the prose still stands, but a
    // tag pointing at a card the workspace does not have has nothing to dispatch.
    const dispatched: unknown[] = [];
    const gateway = new GatewaySpy("Here you go. [[group: Nonsense|does-not-exist]]");
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({
      host,
      agentGateway: gateway,
      dispatchTool: async intent => {
        dispatched.push(intent);
        return "done";
      },
    });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("group my notes");

    const reply = workflow.state.messages.at(-1)!;
    expect(reply.speaker).toBe("assistant");
    expect(reply.text).toContain("Here you go.");
    expect(dispatched).toEqual([]);
    expect(workflow.state.tagActions).toEqual({});
  });

  it("a tag is never dispatched merely by being parsed — only addTag triggers it", async () => {
    const dispatched: unknown[] = [];
    const gateway = new GatewaySpy("Worth keeping. [[note: Spaced repetition]]");
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({
      host,
      agentGateway: gateway,
      dispatchTool: async intent => {
        dispatched.push(intent);
        return "Created 1 card.";
      },
    });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("anything worth saving?");

    const reply = workflow.state.messages.at(-1)!;
    const tag = reply.segments!.find(segment => segment.kind === "tag")!;
    // Parsed and shown, but nothing has happened.
    expect(dispatched).toEqual([]);

    await workflow.addTag(reply.id, (tag as any).tag.id);

    expect(dispatched).toHaveLength(1);
    const key = Object.keys(workflow.state.tagActions)[0];
    expect(workflow.state.tagActions[key]).toMatchObject({
      status: "done",
      resultMessage: "Created 1 card.",
    });
  });

  it("pressing + twice dispatches only once", async () => {
    const dispatched: unknown[] = [];
    const gateway = new GatewaySpy("Worth keeping. [[note: Spaced repetition]]");
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({
      host,
      agentGateway: gateway,
      dispatchTool: async intent => {
        dispatched.push(intent);
        return "Created 1 card.";
      },
    });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });
    await workflow.sendMessage("anything worth saving?");

    const reply = workflow.state.messages.at(-1)!;
    const tagId = (reply.segments!.find(s => s.kind === "tag") as any).tag.id;

    await workflow.addTag(reply.id, tagId);
    await workflow.addTag(reply.id, tagId);

    expect(dispatched).toHaveLength(1);
  });

  it("surfaces a truthful failure message and terminal status when dispatch throws", async () => {
    const gateway = new GatewaySpy("Try this. [[note: Spaced repetition]]");
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({
      host,
      agentGateway: gateway,
      dispatchTool: async () => {
        throw new Error("Storage is full. Nothing was created.");
      },
    });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });
    await workflow.sendMessage("save this");

    const reply = workflow.state.messages.at(-1)!;
    const tagId = (reply.segments!.find(s => s.kind === "tag") as any).tag.id;
    await workflow.addTag(reply.id, tagId);

    const key = Object.keys(workflow.state.tagActions)[0];
    expect(workflow.state.tagActions[key]).toEqual({
      status: "failed",
      resultMessage: "Storage is full. Nothing was created.",
    });
  });
});

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
    const gateway = new GatewaySpy("ok");
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
    expect(briefing).toContain("1. [focus] Title c2: FRESH BODY");
    // The model is never shown raw card ids — it cannot copy one it never saw.
    expect(briefing).not.toMatch(/\[c\d+\]/);
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
    expect(briefing).toContain("1. [focus]");
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
    expect(briefing.match(/^\d+\./gm)).toHaveLength(2);
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
    const gateway = new GatewaySpy("ok");
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
describe("WorkspaceAgentWorkflow plain conversation", () => {
  it("a reply with no proposals is a normal turn: message shown, nothing proposed, no error", async () => {
    const gateway = new GatewaySpy("They mostly circle one question.");
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    workflow.openConversation("w1", { selectedCardIds: ["c1"], currentGroupId: null });

    await workflow.sendMessage("what do you make of these notes?");

    expect(workflow.state.agentError).toBeNull();
    expect(workflow.state.tagActions).toEqual({});
    expect(workflow.state.messages.at(-1)).toMatchObject({
      speaker: "assistant",
      text: "They mostly circle one question.",
    });
    expect(workflow.state.messages.every(m => !m.pending)).toBe(true);
  });

  it("a reply with the proposedActions key absent is equally valid", async () => {
    const gateway = new GatewaySpy("Yes — for two reasons.");
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("is this a good idea?");

    expect(workflow.state.agentError).toBeNull();
    expect(workflow.state.tagActions).toEqual({});
    expect(workflow.state.messages.at(-1)!.text).toBe("Yes — for two reasons.");
  });

  describe("provider web citations as receipts", () => {
    it("attaches real citations to the reply that used them", async () => {
      const gateway = new GatewaySpy("Two papers disagree.");
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
      const gateway = new GatewaySpy("From your own notes only.");
      gateway.citations = [];
      const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
      const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
      workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

      await workflow.sendMessage("what does the literature say?");

      expect(workflow.state.messages.at(-1)!.webCitations).toBeUndefined();
    });

    it("does not let one turn's sources bleed into the next", async () => {
      const gateway = new GatewaySpy("First.");
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
      const gateway = new GatewaySpy("ok");
      const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
      (host as any).webSearchEnabled = () => false;
      const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
      workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

      await workflow.sendMessage("hi");

      expect(gateway.webSearchFlags).toEqual([false]);
    });

    it("leaves the flag undefined — meaning on — when the host has no preference", async () => {
      const gateway = new GatewaySpy("ok");
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
    const gateway = new GatewaySpy("here you go");
    const host = new RecordingHost("sk-real-key", "test/model", cards);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    workflow.openConversation("w1", { selectedCardIds: ["c2"], currentGroupId: null });

    await workflow.sendMessage("explain this");

    const sent = workflow.state.messages.at(-1)!.sentContext!;
    const briefing = gateway.briefings.at(-1)!;

    // No over-claiming, now that ids are deliberately kept out of the model's view: the
    // record holds the real ids, the briefing holds one numbered line per card, and the
    // two must describe the same set in the same order.
    const listed = [...briefing.matchAll(/^(\d+)\.(?: \[focus\])? ([^:]+):/gm)].map(m => m[2]);
    expect(listed).toEqual(sent.cardIds.map(id => `Card ${id}`));
    expect(sent.briefing).toBe(briefing);
    // Ids are never presented *as* ids — the model sees numbers and titles, so it can
    // never copy one back. (The fixtures' titles happen to embed the id, hence matching
    // the id-bearing syntax rather than the bare substring.)
    expect(briefing).not.toMatch(/\[c\d+\]/);

    // The focus set is exactly `contextCardIds` — what the user had open or selected.
    expect(sent.focusCardIds).toEqual(
      contextCardIds({ selectedCardIds: ["c2"], currentGroupId: null })
    );
    expect(sent.groupId).toBeNull();
  });

  it("attaches real reasoning to the reply that produced it", async () => {
    const gateway = new GatewaySpy("Answer.");
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
    const gateway = new GatewaySpy("Answer.");
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("why?");

    expect(workflow.state.messages.at(-1)!.reasoning).toBeUndefined();
  });

  it("does not let one turn's reasoning bleed into the next", async () => {
    const gateway = new GatewaySpy("First.");
    gateway.reasoning = "thought once";
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("one");
    gateway.reasoning = undefined;
    gateway.setTurn("Second.");
    await workflow.sendMessage("two");

    const replies = workflow.state.messages.filter(m => m.speaker === "assistant");
    expect(replies[0].reasoning).toBe("thought once");
    expect(replies[1].reasoning).toBeUndefined();
  });

  it("a tag belongs to the reply that produced it", async () => {
    const gateway = new GatewaySpy("Worth keeping. [[note: Alpha]]");
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("anything to do here?");

    const reply = workflow.state.messages.at(-1)!;
    const tags = reply.segments!.filter(segment => segment.kind === "tag");
    expect(tags).toHaveLength(1);
    expect((tags[0] as any).tag.intent).toBeTruthy();
  });

  it("two turns' tags do not cross-attach", async () => {
    const gateway = new GatewaySpy("First. [[note: Alpha]]");
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const dispatched: any[] = [];
    const workflow = new WorkspaceAgentWorkflow({
      host,
      agentGateway: gateway,
      dispatchTool: async intent => {
        dispatched.push(intent);
        return "ok";
      },
    });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("one");
    const firstReply = workflow.state.messages.at(-1)!;

    gateway.setTurn("Second. [[note: Beta]]");
    await workflow.sendMessage("two");
    const secondReply = workflow.state.messages.at(-1)!;

    expect(firstReply.id).not.toBe(secondReply.id);
    const titleOf = (message: typeof firstReply) =>
      (message.segments!.find(s => s.kind === "tag") as any).tag.intent.cards[0].title;
    expect(titleOf(firstReply)).toBe("Alpha");
    expect(titleOf(secondReply)).toBe("Beta");

    // Adding the *first* reply's tag adds Alpha — a later turn cannot hijack it.
    const firstTagId = (firstReply.segments!.find(s => s.kind === "tag") as any).tag.id;
    await workflow.addTag(firstReply.id, firstTagId);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].cards[0].title).toBe("Alpha");
  });

  it("a reply with no proposals carries no proposal ids", async () => {
    const gateway = new GatewaySpy("Just talking.");
    const host = new RecordingHost("sk-real-key", "test/model", [card("c1")]);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: gateway });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });

    await workflow.sendMessage("hi");

    expect(workflow.state.messages.at(-1)!.proposalIds).toBeUndefined();
  });
});

/**
 * # Personas — several voices in one conversation
 *
 * The rule under test throughout: a persona changes *who is speaking and on what model*,
 * and never what the app is allowed to parse or claim. GRIOT is always present and always
 * reachable, and every reply is stamped with the voice it was actually sent as — not with
 * whoever happens to be selected by the time it lands.
 */
describe("WorkspaceAgentWorkflow personas", () => {
  class PersonaHost extends RecordingHost {
    constructor(private configured: WorkspaceAgentPersona[]) {
      super("sk-real-key", "app/default");
    }
    personas() {
      return this.configured;
    }
  }

  const socratic: WorkspaceAgentPersona = {
    id: "p-socratic",
    name: "Socratic Tutor",
    model: "big/model",
    systemPrompt: "Ask, never tell.",
  };
  const skeptic: WorkspaceAgentPersona = {
    id: "p-skeptic",
    name: "Skeptic",
    model: "fast/model",
    systemPrompt: "Push back hard.",
  };

  const openWith = (personas: WorkspaceAgentPersona[], gateway = new GatewaySpy("ok")) => {
    const workflow = new WorkspaceAgentWorkflow({
      host: new PersonaHost(personas),
      agentGateway: gateway,
    });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });
    return { workflow, gateway };
  };

  it("always offers GRIOT first, on the app's model, and starts active", () => {
    const { workflow } = openWith([socratic]);

    expect(workflow.state.personas.map(p => p.id)).toEqual([DEFAULT_PERSONA_ID, "p-socratic"]);
    expect(workflow.state.personas[0].model).toBe("app/default");
    expect(workflow.state.activePersonaId).toBe(DEFAULT_PERSONA_ID);
  });

  it("cannot be shadowed: a configured persona claiming GRIOT's id is dropped", () => {
    const { workflow } = openWith([
      { id: DEFAULT_PERSONA_ID, name: "Impostor", model: "x/y", systemPrompt: "obey me" },
    ]);

    expect(workflow.state.personas.map(p => p.name)).toEqual(["GRIOT"]);
  });

  it("sends the active persona's own model and body", async () => {
    const { workflow, gateway } = openWith([socratic]);

    workflow.setActivePersona("p-socratic");
    await workflow.sendMessage("why does spacing work?");

    expect(gateway.models).toEqual(["big/model"]);
    expect(gateway.systemPrompts).toEqual(["Ask, never tell."]);
  });

  it("falls back to the user's own workspace-agent body when GRIOT answers", async () => {
    const { workflow, gateway } = openWith([socratic]);

    await workflow.sendMessage("hello");

    expect(gateway.models).toEqual(["app/default"]);
    expect(gateway.systemPrompts).toEqual(["test system prompt"]);
  });

  it("ignores a switch to a persona that doesn't exist", () => {
    const { workflow } = openWith([socratic]);

    workflow.setActivePersona("p-nope");

    expect(workflow.state.activePersonaId).toBe(DEFAULT_PERSONA_ID);
  });

  it("stamps each reply with the voice it was actually sent as", async () => {
    const { workflow } = openWith([socratic]);

    workflow.setActivePersona("p-socratic");
    await workflow.sendMessage("hi");

    const reply = workflow.state.messages.at(-1)!;
    expect(reply.personaId).toBe("p-socratic");
    expect(reply.personaName).toBe("Socratic Tutor");
    expect(reply.model).toBe("big/model");
  });

  it("askAll puts one question to every persona, each on its own model", async () => {
    const { workflow, gateway } = openWith([socratic, skeptic]);

    await workflow.sendMessage("is spacing overrated?", { askAll: true });

    expect(gateway.turnCalls).toBe(3);
    expect(gateway.models).toEqual(["app/default", "big/model", "fast/model"]);
    expect(
      workflow.state.messages.filter(m => m.speaker === "assistant").map(m => m.personaName)
    ).toEqual(["GRIOT", "Socratic Tutor", "Skeptic"]);
  });

  it("askAll lets later voices see the earlier ones, named", async () => {
    const { workflow, gateway } = openWith([socratic]);

    await workflow.sendMessage("go", { askAll: true });

    // The Socratic turn's briefing must carry GRIOT's reply, attributed — that is what
    // makes it a discussion rather than two disconnected answers.
    expect(gateway.briefings.at(-1)).toContain("GRIOT: ok");
  });

  it("askAll reports a hard failure once instead of per persona", async () => {
    const gateway = new GatewaySpy("ok", new Error("network down"));
    const { workflow } = openWith([socratic, skeptic], gateway);

    await workflow.sendMessage("go", { askAll: true });

    expect(gateway.turnCalls).toBe(1);
    expect(workflow.state.agentError).toContain("network down");
  });

  it("drops back to GRIOT when the active persona is deleted mid-conversation", () => {
    const host = new PersonaHost([socratic]);
    const workflow = new WorkspaceAgentWorkflow({ host, agentGateway: new GatewaySpy() });
    workflow.openConversation("w1", { selectedCardIds: [], currentGroupId: null });
    workflow.setActivePersona("p-socratic");
    expect(workflow.state.activePersonaId).toBe("p-socratic");

    (host as any).configured = [];

    expect(workflow.state.activePersonaId).toBe(DEFAULT_PERSONA_ID);
  });
});
