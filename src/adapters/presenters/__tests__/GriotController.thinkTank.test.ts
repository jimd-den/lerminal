import { describe, expect, it } from "bun:test";
import { GriotController } from "../GriotController";
import { MemoryCardRepository } from "../../repositories/MemoryCardRepository";
import { MemoryWorkspaceRepository } from "../../repositories/MemoryWorkspaceRepository";
import { MemorySettingsRepository } from "../../repositories/MemorySettingsRepository";
import { MemoryCommandDefinitionRepository } from "../../repositories/MemoryCommandDefinitionRepository";
import { MemoryCardTypeRepository } from "../../repositories/MemoryCardTypeRepository";
import { MemoryPromptPresetRepository } from "../../repositories/MemoryPromptPresetRepository";
import { MemoryAssistantProfileRepository } from "../../repositories/MemoryAssistantProfileRepository";
import { MemoryRoundtableRepository } from "../../repositories/MemoryRoundtableRepository";
import { MemoryConversationRepository } from "../../repositories/MemoryConversationRepository";
import {
  AgentGateway,
  AgentModel,
  AgentAskResult,
  WorkspaceAgentTurnResult,
  RoundtableDesignResponse,
} from "../../../usecases/ports/gateways/AgentGateway";
import { SearchGateway, SearchResult } from "../../../usecases/ports/gateways/SearchGateway";
import { ExtractionGateway } from "../../../usecases/ports/gateways/ExtractionGateway";
import { Card } from "../../../entities/card";

/**
 * # Think Tank — a separate history, proved by actually switching between two of them
 *
 * `conveneThinkTank` is the Bridge's front door onto the table: one topic in, and the
 * whole "design a panel, ask it, make it the board's active thread" sequence runs without
 * the caller orchestrating any of it — and, deliberately, without touching the ambient Ask
 * GRIOT conversation or its modal at all. `ThinkTankWorkflow` is its own store, over the
 * same `ConversationRepository` the ambient conversation persists through, tagged with a
 * `roundtableId` so the two never collide in the same records.
 *
 * The suite's centrepiece is "convening a second table leaves the first exactly as it
 * was" — that is the actual claim "separate history" makes, and the only way to know it
 * holds is to convene two, switch between them, and check.
 */

class StubAgentGateway implements AgentGateway {
  designCalls: { brief: string; systemPrompt?: string }[] = [];
  turnCalls: { briefing: string; model: string; reasoning?: boolean }[] = [];
  nextTurnText = "A reply.";
  /** Lets a test script different replies for consecutive turns. */
  turnTextQueue: string[] = [];
  members: { name: string; systemPrompt: string }[] = [
    { name: "Advocate", systemPrompt: "Argue for the idea." },
    { name: "Skeptic", systemPrompt: "Push back on the idea." },
  ];

  async ask(query: string, contextCards: Card[], apiKey: string, model: string): Promise<AgentAskResult> {
    return { cards: [], isLocalFallback: true };
  }
  async fetchModels(): Promise<AgentModel[]> {
    return [];
  }
  async designWorkspaceAgentTurn(input: {
    briefing: string;
    model: string;
    reasoning?: boolean;
  }): Promise<WorkspaceAgentTurnResult> {
    this.turnCalls.push({ briefing: input.briefing, model: input.model, reasoning: input.reasoning });
    const text = this.turnTextQueue.shift() ?? this.nextTurnText;
    return { text, webCitations: [] };
  }
  async designRoundtable(input: { brief: string; systemPrompt?: string }): Promise<RoundtableDesignResponse> {
    this.designCalls.push(input);
    return {
      nameSuggestion: `Table for "${input.brief.slice(0, 20)}"`,
      members: this.members.map(m => ({ ...m, description: m.name })),
    };
  }
}

class StubExtractionGateway implements ExtractionGateway {
  async extractText(url: string): Promise<string> {
    return `Extracted content from ${url}`;
  }
}

class StubSearchGateway implements SearchGateway {
  async search(query: string): Promise<SearchResult[]> {
    return [{ title: `Result for ${query}`, url: "https://example.com/x", snippet: "..." }];
  }
}

async function buildController() {
  const agentGateway = new StubAgentGateway();

  const controller = new GriotController({
    cardRepo: new MemoryCardRepository(),
    workspaceRepo: new MemoryWorkspaceRepository(),
    settingsRepo: new MemorySettingsRepository(),
    agentGateway,
    commandDefinitionRepo: new MemoryCommandDefinitionRepository(),
    cardTypeRepo: new MemoryCardTypeRepository(),
    promptPresetRepo: new MemoryPromptPresetRepository(),
    assistantProfileRepo: new MemoryAssistantProfileRepository(),
    roundtableRepo: new MemoryRoundtableRepository(),
    conversationRepo: new MemoryConversationRepository(),
    searchGateway: new StubSearchGateway(),
    extractionGateway: new StubExtractionGateway(),
  });

  await controller.init();
  controller.setOpenRouterKey("sk-test-key");
  controller.setSelectedModel("test/model");
  await controller.openThinkTank();

  return { controller, agentGateway };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe("conveneThinkTank", () => {
  it("designs a panel from a bare topic, no cast required", async () => {
    const { controller, agentGateway } = await buildController();

    await controller.conveneThinkTank("Whether spaced repetition beats massed practice");

    expect(agentGateway.designCalls).toHaveLength(1);
    expect(agentGateway.designCalls[0].brief).toBe(
      "Whether spaced repetition beats massed practice"
    );
  });

  it("becomes the board's active thread and asks every member once", async () => {
    const { controller, agentGateway } = await buildController();

    await controller.conveneThinkTank("A random topic");

    const active = controller.getState().thinkTank.active;
    expect(active).not.toBeNull();
    expect(active!.roundtableName).toContain("A random topic");
    expect(active!.messages.some(m => m.speaker === "user" && m.text === "A random topic")).toBe(true);
    expect(agentGateway.turnCalls).toHaveLength(2);
    expect(agentGateway.turnCalls.every(call => call.briefing.includes("A random topic"))).toBe(true);
  });

  it("never opens the Ask GRIOT modal, or its conversation", async () => {
    const { controller } = await buildController();
    controller.closeWorkspaceAgent();

    await controller.conveneThinkTank("A random topic");

    const state = controller.getState();
    expect(state.isAskGriotSheetOpen).toBe(false);
    expect(state.workspaceAgent.isOpen).toBe(false);
    expect(state.workspaceAgent.messages).toHaveLength(0);
  });

  it("does nothing for a blank topic", async () => {
    const { controller, agentGateway } = await buildController();

    await controller.conveneThinkTank("   ");

    expect(agentGateway.designCalls).toHaveLength(0);
    expect(controller.getState().thinkTank.active).toBeNull();
  });

  it("reports, rather than throws, when the provider can't design a panel", async () => {
    const bareGateway: AgentGateway = {
      async ask() {
        return { cards: [], isLocalFallback: true };
      },
      async fetchModels() {
        return [];
      },
    };
    const controller = new GriotController({
      cardRepo: new MemoryCardRepository(),
      workspaceRepo: new MemoryWorkspaceRepository(),
      settingsRepo: new MemorySettingsRepository(),
      agentGateway: bareGateway,
      commandDefinitionRepo: new MemoryCommandDefinitionRepository(),
      cardTypeRepo: new MemoryCardTypeRepository(),
      promptPresetRepo: new MemoryPromptPresetRepository(),
      assistantProfileRepo: new MemoryAssistantProfileRepository(),
      roundtableRepo: new MemoryRoundtableRepository(),
      conversationRepo: new MemoryConversationRepository(),
      searchGateway: new StubSearchGateway(),
      extractionGateway: new StubExtractionGateway(),
    });
    await controller.init();
    controller.setOpenRouterKey("sk-test-key");

    await controller.conveneThinkTank("Anything");

    expect(controller.getState().thinkTank.active).toBeNull();
    expect(controller.getState().toastMessage).toBeTruthy();
  });
});

describe("a separate history — the actual claim", () => {
  it("convening a second table leaves the first exactly as it was", async () => {
    const { controller, agentGateway } = await buildController();

    await controller.conveneThinkTank("First topic");
    const firstId = controller.getState().thinkTank.active!.roundtableId;
    const firstMessagesBefore = controller.getState().thinkTank.active!.messages;

    await controller.conveneThinkTank("Second topic");
    const secondId = controller.getState().thinkTank.active!.roundtableId;

    expect(secondId).not.toBe(firstId);
    expect(controller.getState().thinkTank.active!.roundtableId).toBe(secondId);
    // Two distinct rows in history, not one overwritten by the other.
    expect(controller.getState().thinkTank.history.map(h => h.roundtableId).sort()).toEqual(
      [firstId, secondId].sort()
    );

    await controller.setActiveThinkTank(firstId);

    const restoredFirst = controller.getState().thinkTank.active!;
    expect(restoredFirst.roundtableId).toBe(firstId);
    expect(restoredFirst.messages.map(m => m.text)).toEqual(
      firstMessagesBefore.map(m => m.text)
    );
  });

  it("posting to one active thread never reaches another", async () => {
    const { controller, agentGateway } = await buildController();

    await controller.conveneThinkTank("First topic");
    const firstId = controller.getState().thinkTank.active!.roundtableId;

    await controller.conveneThinkTank("Second topic");
    const secondId = controller.getState().thinkTank.active!.roundtableId;

    controller.postToThinkTank(secondId, "more for the second table");
    await flush();

    await controller.setActiveThinkTank(firstId);
    const first = controller.getState().thinkTank.active!;
    expect(first.messages.some(m => m.text === "more for the second table")).toBe(false);
  });

  it("dismissing hides the board without touching the thread", async () => {
    const { controller } = await buildController();
    await controller.conveneThinkTank("A random topic");
    const roundtableId = controller.getState().thinkTank.active!.roundtableId;

    controller.dismissThinkTank();

    expect(controller.getState().thinkTank.active).toBeNull();
    // Still in history, still reopenable with everything intact.
    expect(controller.getState().thinkTank.history.some(h => h.roundtableId === roundtableId)).toBe(
      true
    );
    await controller.setActiveThinkTank(roundtableId);
    expect(controller.getState().thinkTank.active!.messages.length).toBeGreaterThan(0);
  });

  it("deleting a thread removes it from history and, if active, from the board", async () => {
    const { controller } = await buildController();
    await controller.conveneThinkTank("A random topic");
    const roundtableId = controller.getState().thinkTank.active!.roundtableId;

    await controller.deleteThinkTankThread(roundtableId);

    expect(controller.getState().thinkTank.active).toBeNull();
    expect(controller.getState().thinkTank.history).toHaveLength(0);
  });

  it("survives a fresh controller reading the same store — real persistence, not just memory", async () => {
    const conversationRepo = new MemoryConversationRepository();
    const roundtableRepo = new MemoryRoundtableRepository();
    const assistantProfileRepo = new MemoryAssistantProfileRepository();
    const agentGateway = new StubAgentGateway();

    const first = new GriotController({
      cardRepo: new MemoryCardRepository(),
      workspaceRepo: new MemoryWorkspaceRepository(),
      settingsRepo: new MemorySettingsRepository(),
      agentGateway,
      commandDefinitionRepo: new MemoryCommandDefinitionRepository(),
      cardTypeRepo: new MemoryCardTypeRepository(),
      promptPresetRepo: new MemoryPromptPresetRepository(),
      assistantProfileRepo,
      roundtableRepo,
      conversationRepo,
      searchGateway: new StubSearchGateway(),
      extractionGateway: new StubExtractionGateway(),
    });
    await first.init();
    first.setOpenRouterKey("sk-test-key");
    await first.openThinkTank();
    await first.conveneThinkTank("A random topic");
    const workspaceId = first.getState().activeWorkspaceId!;

    const second = new GriotController({
      cardRepo: new MemoryCardRepository(),
      workspaceRepo: new MemoryWorkspaceRepository(),
      settingsRepo: new MemorySettingsRepository(),
      agentGateway,
      commandDefinitionRepo: new MemoryCommandDefinitionRepository(),
      cardTypeRepo: new MemoryCardTypeRepository(),
      promptPresetRepo: new MemoryPromptPresetRepository(),
      assistantProfileRepo,
      roundtableRepo,
      conversationRepo,
      searchGateway: new StubSearchGateway(),
      extractionGateway: new StubExtractionGateway(),
    });
    await second.init();
    await second.switchWorkspace(workspaceId);
    await second.openThinkTank();

    expect(second.getState().thinkTank.history).toHaveLength(1);
    expect(second.getState().thinkTank.history[0].title).toContain("A random topic");
  });
});

describe("retryThinkTankReply and rethinkThinkTankReply", () => {
  it("retry re-asks the same voice the same question, as a new post", async () => {
    const { controller, agentGateway } = await buildController();
    await controller.conveneThinkTank("A random topic");
    const roundtableId = controller.getState().thinkTank.active!.roundtableId;

    const before = controller.getState().thinkTank.active!.messages;
    const firstReply = before.find(m => m.speaker === "assistant")!;
    const countBefore = before.length;
    agentGateway.turnCalls = [];

    controller.retryThinkTankReply(roundtableId, firstReply.id);
    await flush();

    const after = controller.getState().thinkTank.active!.messages;
    // A retry re-posts the question, then the new reply — the original stays verbatim.
    expect(after.length).toBe(countBefore + 2);
    expect(after.find(m => m.id === firstReply.id)?.text).toBe(firstReply.text);
    expect(agentGateway.turnCalls).toHaveLength(1);
  });

  it("rethink asks the voice to look at its own reply again", async () => {
    const { controller, agentGateway } = await buildController();
    await controller.conveneThinkTank("A random topic");
    const roundtableId = controller.getState().thinkTank.active!.roundtableId;

    const firstReply = controller.getState().thinkTank.active!.messages.find(
      m => m.speaker === "assistant"
    )!;
    agentGateway.turnCalls = [];

    controller.rethinkThinkTankReply(roundtableId, firstReply.id);
    await flush();

    expect(agentGateway.turnCalls).toHaveLength(1);
    expect(agentGateway.turnCalls[0].briefing).toContain(firstReply.text);
  });

  it("does nothing for a message with no persona", async () => {
    const { controller, agentGateway } = await buildController();
    await controller.conveneThinkTank("A random topic");
    const roundtableId = controller.getState().thinkTank.active!.roundtableId;

    const userMessage = controller.getState().thinkTank.active!.messages.find(
      m => m.speaker === "user"
    )!;
    agentGateway.turnCalls = [];

    controller.retryThinkTankReply(roundtableId, userMessage.id);
    controller.rethinkThinkTankReply(roundtableId, userMessage.id);
    await flush();

    expect(agentGateway.turnCalls).toHaveLength(0);
  });
});

describe("postToThinkTank", () => {
  it("asks every member of the thread's own panel again, in order", async () => {
    const { controller, agentGateway } = await buildController();
    await controller.conveneThinkTank("A random topic");
    const roundtableId = controller.getState().thinkTank.active!.roundtableId;
    agentGateway.turnCalls = [];

    controller.postToThinkTank(roundtableId, "a follow-up");
    await flush();

    expect(agentGateway.turnCalls).toHaveLength(2);
    expect(agentGateway.turnCalls.every(call => call.briefing.includes("a follow-up"))).toBe(true);
  });
});

describe("seating the Skeptic", () => {
  it("adds the built-in Skeptic to the designed panel when asked", async () => {
    const { controller } = await buildController();

    await controller.conveneThinkTank("A random topic", { includeSkeptic: true });

    const active = controller.getState().thinkTank.active!;
    expect(active.messages.some(m => m.personaName === "The Skeptic")).toBe(true);
    // Written back into the saved roundtable, not just this one convening.
    const roundtable = controller.getState().roundtables.find(rt => rt.id === active.roundtableId)!;
    expect(roundtable.memberIds).toContain("builtin-skeptic");
  });

  it("does not seat it unless asked", async () => {
    const { controller } = await buildController();

    await controller.conveneThinkTank("A random topic");

    const active = controller.getState().thinkTank.active!;
    expect(active.messages.some(m => m.personaName === "The Skeptic")).toBe(false);
  });

  it("never adds it twice", async () => {
    const { controller } = await buildController();
    await controller.conveneThinkTank("A random topic", { includeSkeptic: true });
    const roundtableId = controller.getState().thinkTank.active!.roundtableId;
    const roundtable = controller.getState().roundtables.find(rt => rt.id === roundtableId)!;

    expect(roundtable.memberIds.filter(id => id === "builtin-skeptic")).toHaveLength(1);
  });
});

describe("the reasoning toggle", () => {
  it("defaults to on, and is never sent as false unless the captain turns it off", async () => {
    const { controller, agentGateway } = await buildController();

    await controller.conveneThinkTank("A random topic");

    expect(agentGateway.turnCalls.every(call => call.reasoning !== false)).toBe(true);
  });

  it("convening fast sends reasoning: false on the opening turn", async () => {
    const { controller, agentGateway } = await buildController();

    await controller.conveneThinkTank("A random topic", { reasoning: false });

    expect(agentGateway.turnCalls).toHaveLength(2);
    expect(agentGateway.turnCalls.every(call => call.reasoning === false)).toBe(true);
  });

  it("toggling it on the board applies from the next post, not retroactively", async () => {
    const { controller, agentGateway } = await buildController();
    await controller.conveneThinkTank("A random topic");
    const roundtableId = controller.getState().thinkTank.active!.roundtableId;
    agentGateway.turnCalls = [];

    controller.setThinkTankReasoning(roundtableId, false);
    controller.postToThinkTank(roundtableId, "a follow-up");
    await flush();

    expect(agentGateway.turnCalls.every(call => call.reasoning === false)).toBe(true);
  });
});

describe("a station that opens a discussion on its own", () => {
  it("convenes a think tank without the captain tapping anything", async () => {
    const { controller, agentGateway } = await buildController();
    await controller.openBridge();
    controller.openCommission("sensors");
    controller.updateStationDraft({ autoDiscuss: true, watch: { kind: "standing" } });
    await controller.commissionStation();

    // Sensors needs cards to actually find something — an ungrouped cluster is what
    // `observeWorkspace` looks for.
    for (let i = 0; i < 4; i += 1) {
      await controller.createNote({ title: `Loose note ${i}`, content: "b" });
    }
    const stationId = controller.getState().bridge.stations[0].id;
    agentGateway.designCalls = [];

    await controller.standWatch(stationId);
    // `autoConvene` is fire-and-forget, same as every other agent send in this app — see
    // `BridgeWorkflowDeps.autoConvene`'s own doc.
    await flush();

    // A board topic exists, and the captain never called conveneThinkTank themselves.
    expect(controller.getState().thinkTank.active).not.toBeNull();
    expect(agentGateway.designCalls).toHaveLength(1);
  });

  it("stays quiet by default — a station never opens a discussion unless asked to", async () => {
    const { controller, agentGateway } = await buildController();
    await controller.openBridge();
    controller.openCommission("sensors");
    controller.updateStationDraft({ watch: { kind: "standing" } });
    await controller.commissionStation();

    for (let i = 0; i < 4; i += 1) {
      await controller.createNote({ title: `Loose note ${i}`, content: "b" });
    }
    const stationId = controller.getState().bridge.stations[0].id;

    await controller.standWatch(stationId);

    expect(controller.getState().thinkTank.active).toBeNull();
  });
});
