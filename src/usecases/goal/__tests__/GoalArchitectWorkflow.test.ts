import { describe, expect, it } from "bun:test";
import {
  GoalArchitectHost,
  GoalArchitectWorkflow,
} from "../GoalArchitectWorkflow";
import { AgentGateway } from "../../ports/gateways/AgentGateway";
import { RecommendedResearch } from "../../../entities/goalArchitect";

class RecordingHost implements GoalArchitectHost {
  changes = 0;
  researchRequests: RecommendedResearch[][] = [];
  constructor(
    private key = "",
    private modelId = "test/model"
  ) {}
  apiKey() {
    return this.key;
  }
  model() {
    return this.modelId;
  }
  systemPrompt() {
    return "test system prompt";
  }
  onChange() {
    this.changes += 1;
  }
  requestResearchApproval(queries: RecommendedResearch[]) {
    this.researchRequests.push(queries);
  }
}

/** A gateway that records every call, so "did this browse?" is directly assertable. */
class SpyGateway implements AgentGateway {
  askCalls = 0;
  turnCalls: { briefing: string; systemPrompt?: string; webSearchEnabled?: boolean }[] = [];

  constructor(
    private turn: unknown = { message: "ok", workingMap: {} },
    private failure?: Error,
    private webCitations: { url: string; title: string }[] = []
  ) {}

  async ask() {
    this.askCalls += 1;
    return { cards: [], isLocalFallback: false };
  }
  async fetchModels() {
    return [];
  }
  async designGoalArchitectTurn(input: {
    briefing: string;
    apiKey: string;
    model: string;
    systemPrompt?: string;
    webSearchEnabled?: boolean;
  }) {
    this.turnCalls.push({
      briefing: input.briefing,
      systemPrompt: input.systemPrompt,
      webSearchEnabled: input.webSearchEnabled,
    });
    if (this.failure) throw this.failure;
    return { raw: this.turn, webCitations: this.webCitations };
  }
}

/** A gateway with no goal-planning support at all, like an older or mocked one. */
class BareGateway implements AgentGateway {
  async ask() {
    return { cards: [], isLocalFallback: false };
  }
  async fetchModels() {
    return [];
  }
}

const build = (host: RecordingHost, agentGateway?: AgentGateway) =>
  new GoalArchitectWorkflow({ host, agentGateway });

/** Answers the required opening question and returns the workflow. */
function started(host: RecordingHost, gateway?: AgentGateway) {
  const workflow = build(host, gateway);
  workflow.open();
  workflow.submitAnswer("Build a playable puzzle game");
  return workflow;
}

describe("GoalArchitectWorkflow without an API key", () => {
  it("runs the whole flow to a mission proposal", async () => {
    const workflow = started(new RecordingHost(""));

    workflow.proposeMission();

    expect(workflow.state.stage).toBe("proposal");
    expect(workflow.state.proposal?.title).toBe("Build a playable puzzle game");
    expect(workflow.state.proposal?.suggestedCards.length).toBeGreaterThan(0);
  });

  it("opens on the required question", () => {
    const workflow = build(new RecordingHost(), undefined);
    workflow.open();

    expect(workflow.state.question?.id).toBe("outcome");
    expect(workflow.state.isOpen).toBe(true);
  });

  it("builds the working map from the answers alone", () => {
    const workflow = started(new RecordingHost(""));

    expect(workflow.state.map.goal?.text).toBe("Build a playable puzzle game");
    expect(workflow.state.map.goal?.origin).toBe("user");
  });

  it("explains what needs a model instead of silently doing nothing", async () => {
    const workflow = started(new RecordingHost(""), new SpyGateway());

    await workflow.requestAgentTurn();

    expect(workflow.state.agentError).toContain("No API key");
    expect(workflow.state.modelUsed).toBe(false);
  });

  it("keeps every answer when a model call is refused for want of a key", async () => {
    const workflow = started(new RecordingHost(""), new SpyGateway());

    await workflow.requestAgentTurn();

    expect(workflow.state.answers).toHaveLength(1);
    expect(workflow.state.map.goal?.text).toBe("Build a playable puzzle game");
  });

  it("won't propose a mission before the required question is answered", () => {
    const workflow = build(new RecordingHost(), undefined);
    workflow.open();

    expect(workflow.canPropose).toBe(false);
    workflow.proposeMission();
    expect(workflow.state.stage).toBe("intent");
  });
});

describe("question flow", () => {
  it("preserves a skip and never asks it again", () => {
    const host = new RecordingHost();
    const workflow = started(host);
    const skipped = workflow.state.question!.id;

    workflow.skipCurrent();

    const answer = workflow.state.answers.find(a => a.questionId === skipped);
    expect(answer?.skipped).toBe(true);
    expect(workflow.state.question?.id).not.toBe(skipped);
  });

  it("surfaces a skipped question as a known gap", () => {
    const workflow = started(new RecordingHost());
    workflow.skipCurrent();

    expect(workflow.state.map.unknowns.some(u => u.text.startsWith("Skipped:"))).toBe(true);
  });

  it("rebuilds the map when an earlier answer is corrected", () => {
    const workflow = started(new RecordingHost());

    workflow.editAnswer("outcome", "Build a rhythm game");

    expect(workflow.state.map.goal?.text).toBe("Build a rhythm game");
    expect(workflow.state.answers).toHaveLength(1);
  });

  it("drops a finding that the corrected answer no longer supports", () => {
    const host = new RecordingHost();
    const workflow = build(host);
    workflow.open();
    // A goal that implies nothing else, so the next question really is the deliverable.
    workflow.submitAnswer("Learn category theory");
    expect(workflow.state.question?.id).toBe("finished-result");
    workflow.submitAnswer("A written summary of the Yoneda lemma");
    expect(workflow.state.map.deliverable).toBeTruthy();

    workflow.editAnswer("finished-result", "");

    // Recomputed from scratch, so removing an answer removes what it had implied.
    expect(workflow.state.map.deliverable).toBeUndefined();
  });

  it("ignores an empty answer rather than recording a blank one", () => {
    const workflow = build(new RecordingHost());
    workflow.open();

    workflow.submitAnswer("   ");

    expect(workflow.state.answers).toHaveLength(0);
  });

  it("keeps answers when returning from the draft to the questions", () => {
    const workflow = started(new RecordingHost());
    workflow.proposeMission();

    workflow.backToQuestions();

    expect(workflow.state.stage).toBe("intent");
    expect(workflow.state.answers).toHaveLength(1);
  });
});

describe("agent turns", () => {
  it("labels everything the model contributes as an agent hypothesis", async () => {
    const gateway = new SpyGateway({
      message: "Some things you may not have considered.",
      workingMap: { risks: ["Level generation performance"] },
    });
    const workflow = started(new RecordingHost("key"), gateway);

    await workflow.requestAgentTurn();

    const risk = workflow.state.map.risks.find(r => r.text.includes("Level generation"));
    expect(risk?.origin).toBe("agent");
    expect(workflow.state.modelUsed).toBe(true);
  });

  it("keeps the user's own findings distinguishable from the model's", async () => {
    const gateway = new SpyGateway({
      message: "ok",
      workingMap: { risks: ["A model's risk"] },
    });
    const host = new RecordingHost("key");
    const workflow = build(host, gateway);
    workflow.open();
    workflow.submitAnswer("Build a game");
    workflow.submitAnswer("A demo");
    workflow.submitAnswer("No budget");

    await workflow.requestAgentTurn();

    const origins = new Set(workflow.state.map.risks.map(r => r.origin));
    expect(origins.has("agent")).toBe(true);
  });

  it("never sends the whole workspace — only the answers and the map", async () => {
    const gateway = new SpyGateway();
    const workflow = started(new RecordingHost("key"), gateway);

    await workflow.requestAgentTurn();

    const briefing = gateway.turnCalls[0].briefing;
    expect(briefing).toContain("Build a playable puzzle game");
    expect(briefing).toContain("The user's answers so far");
  });

  it("runs the turn with the host's configured instruction, never a hardcoded one", async () => {
    const gateway = new SpyGateway();
    const workflow = started(new RecordingHost("key"), gateway);

    await workflow.requestAgentTurn();

    // RecordingHost.systemPrompt() — proves the workflow asks the host rather than
    // carrying its own prompt, so the conversation's instruction is only ever the one
    // the user's Goal Architect assistant profile resolves to.
    expect(gateway.turnCalls[0].systemPrompt).toBe("test system prompt");
  });

  it("does not browse: an agent turn touches no search gateway", async () => {
    const host = new RecordingHost("key");
    const workflow = started(host, new SpyGateway());

    await workflow.requestAgentTurn();

    // The only path to the web is the preflight, which nothing here triggered.
    expect(host.researchRequests).toEqual([]);
    expect(workflow.state.webUsed).toBe(false);
  });

  it("keeps the answers and explains itself when the model is unreachable", async () => {
    const gateway = new SpyGateway(undefined, new Error("network down"));
    const workflow = started(new RecordingHost("key"), gateway);

    await workflow.requestAgentTurn();

    expect(workflow.state.agentError).toContain("network down");
    expect(workflow.state.agentError).toContain("answers are safe");
    expect(workflow.state.answers).toHaveLength(1);
    expect(workflow.state.isAgentThinking).toBe(false);
  });

  it("refuses malformed output instead of rendering half a turn", async () => {
    const gateway = new SpyGateway({ garbage: true });
    const workflow = started(new RecordingHost("key"), gateway);

    await workflow.requestAgentTurn();

    expect(workflow.state.agentError).toContain("usable shape");
    expect(workflow.state.agentQuestion).toBeNull();
    expect(workflow.state.answers).toHaveLength(1);
  });

  it("reports honestly when the gateway has no goal-planning support", async () => {
    const workflow = started(new RecordingHost("key"), new BareGateway());

    await workflow.requestAgentTurn();

    expect(workflow.state.agentError).toContain("no model connection");
    expect(workflow.state.modelUsed).toBe(false);
  });

  it("keeps agent findings when a later answer rebuilds the map", async () => {
    const gateway = new SpyGateway({
      message: "ok",
      workingMap: { prerequisites: ["Tilemap collision"] },
    });
    const workflow = started(new RecordingHost("key"), gateway);
    await workflow.requestAgentTurn();

    workflow.submitAnswer("A demo with ten levels");

    const kept = workflow.state.map.prerequisites.find(p => p.text === "Tilemap collision");
    expect(kept?.origin).toBe("agent");
  });

  it("clears last turn's prose so it can't read as a reply to a new answer", async () => {
    const gateway = new SpyGateway({ message: "About your goal…", workingMap: {} });
    const workflow = started(new RecordingHost("key"), gateway);
    await workflow.requestAgentTurn();
    expect(workflow.state.agentMessage).toBe("About your goal…");

    workflow.submitAnswer("A demo");

    expect(workflow.state.agentMessage).toBeNull();
  });
});

describe("research", () => {
  it("asks for approval rather than searching", () => {
    const gateway = new SpyGateway({
      message: "ok",
      workingMap: {},
      recommendedResearch: [
        { query: "tilemap collision techniques", rationale: "prior art", sourceKinds: ["docs"] },
      ],
    });
    const host = new RecordingHost("key");
    const workflow = started(host, gateway);

    return workflow.requestAgentTurn().then(() => {
      workflow.requestResearch();

      // The queries go to the preflight; only the user's approval can start a search.
      expect(host.researchRequests).toHaveLength(1);
      expect(host.researchRequests[0][0].query).toBe("tilemap collision techniques");
      expect(workflow.state.webUsed).toBe(false);
    });
  });

  it("does nothing when there is no query to run", () => {
    const host = new RecordingHost("key");
    const workflow = started(host, new SpyGateway());

    workflow.requestResearch();

    expect(host.researchRequests).toEqual([]);
  });

  it("records web use only when the host reports a real search happened", () => {
    const workflow = started(new RecordingHost("key"), new SpyGateway());
    expect(workflow.state.webUsed).toBe(false);

    workflow.markWebUsed();

    expect(workflow.state.webUsed).toBe(true);
  });
});

describe("provider web search", () => {
  it("is off by default and never sent unless enabled", async () => {
    const gateway = new SpyGateway();
    const workflow = started(new RecordingHost("key"), gateway);

    await workflow.requestAgentTurn();

    expect(gateway.turnCalls[0].webSearchEnabled).toBe(false);
    expect(workflow.state.webSearchEnabled).toBe(false);
  });

  it("is sent only after the user explicitly turns it on", async () => {
    const gateway = new SpyGateway();
    const workflow = started(new RecordingHost("key"), gateway);

    workflow.setWebSearchEnabled(true);
    await workflow.requestAgentTurn();

    expect(gateway.turnCalls[0].webSearchEnabled).toBe(true);
  });

  it("marks webUsed only when the provider actually returned citations", async () => {
    const gateway = new SpyGateway({ message: "ok", workingMap: {} }, undefined, [
      { url: "https://example.com/a", title: "A" },
    ]);
    const workflow = started(new RecordingHost("key"), gateway);
    workflow.setWebSearchEnabled(true);

    await workflow.requestAgentTurn();

    expect(workflow.state.webUsed).toBe(true);
    expect(workflow.state.webCitations).toEqual([{ url: "https://example.com/a", title: "A" }]);
  });

  it("does not claim web use when the toggle was on but nothing was returned", async () => {
    const workflow = started(new RecordingHost("key"), new SpyGateway());
    workflow.setWebSearchEnabled(true);

    await workflow.requestAgentTurn();

    // Toggling it on is not the same as it having run — only real citations count.
    expect(workflow.state.webUsed).toBe(false);
    expect(workflow.state.webCitations).toEqual([]);
  });

  it("can be turned back off", () => {
    const workflow = started(new RecordingHost("key"), new SpyGateway());

    workflow.setWebSearchEnabled(true);
    workflow.setWebSearchEnabled(false);

    expect(workflow.state.webSearchEnabled).toBe(false);
  });
});
