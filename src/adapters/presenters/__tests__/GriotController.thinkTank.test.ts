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
 * # Think Tank — convening a table from a topic, not a cast, and the board it lives on
 *
 * `conveneThinkTank` is the Bridge's front door onto the table: one topic in, and the
 * whole "design a panel, ask it, make it the board's active table" sequence runs without
 * the caller having to orchestrate any of it — and, deliberately, without opening the Ask
 * GRIOT modal at all, since the whole point is an inline message board on some phones a
 * modal is real friction on. These tests drive it through the real `GriotController`, the
 * same way the existing Workspace Agent tests do, so the roundtable and transcript that
 * come back are what a real send would produce.
 */

class StubAgentGateway implements AgentGateway {
  designCalls: { brief: string; systemPrompt?: string }[] = [];
  turnCalls: { briefing: string }[] = [];
  nextTurnText = "A reply.";

  async ask(query: string, contextCards: Card[], apiKey: string, model: string): Promise<AgentAskResult> {
    return { cards: [], isLocalFallback: true };
  }
  async fetchModels(): Promise<AgentModel[]> {
    return [];
  }
  async designWorkspaceAgentTurn(input: { briefing: string }): Promise<WorkspaceAgentTurnResult> {
    this.turnCalls.push({ briefing: input.briefing });
    return { text: this.nextTurnText, webCitations: [] };
  }
  async designRoundtable(input: { brief: string; systemPrompt?: string }): Promise<RoundtableDesignResponse> {
    this.designCalls.push(input);
    return {
      nameSuggestion: "The panel",
      members: [
        { name: "Advocate", description: "Argues for it", systemPrompt: "Argue for the idea." },
        { name: "Skeptic", description: "Argues against it", systemPrompt: "Push back on the idea." },
      ],
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
    searchGateway: new StubSearchGateway(),
    extractionGateway: new StubExtractionGateway(),
  });

  await controller.init();
  controller.setOpenRouterKey("sk-test-key");
  controller.setSelectedModel("test/model");

  return { controller, agentGateway };
}

describe("conveneThinkTank", () => {
  it("designs a panel from a bare topic, no cast required", async () => {
    const { controller, agentGateway } = await buildController();

    await controller.conveneThinkTank("Whether spaced repetition beats massed practice");

    expect(agentGateway.designCalls).toHaveLength(1);
    expect(agentGateway.designCalls[0].brief).toBe(
      "Whether spaced repetition beats massed practice"
    );
    expect(controller.getState().roundtables).toHaveLength(1);
  });

  it("puts the topic to the new table without opening the Ask GRIOT modal", async () => {
    const { controller, agentGateway } = await buildController();
    // A first launch opens the sheet by itself; close it so the assertion below covers
    // `conveneThinkTank`'s own behaviour, not that one-off.
    controller.closeWorkspaceAgent();

    await controller.conveneThinkTank("A random topic");
    // `askRoundtable` is fire-and-forget by design — see its own doc comment — so the
    // model turns it triggers are still in flight when `conveneThinkTank` returns.
    await new Promise(resolve => setTimeout(resolve, 0));

    const state = controller.getState();
    // The conversation is genuinely live — sends need that — but the modal window that
    // shows it never opens. That split is the whole point.
    expect(state.workspaceAgent.isOpen).toBe(true);
    expect(state.isAskGriotSheetOpen).toBe(false);
    // The opening question still reached both members, in one turn each.
    expect(agentGateway.turnCalls).toHaveLength(2);
    expect(agentGateway.turnCalls.every(call => call.briefing.includes("A random topic"))).toBe(
      true
    );
  });

  it("becomes the Bridge board's active table", async () => {
    const { controller } = await buildController();

    await controller.conveneThinkTank("A random topic");

    const roundtableId = controller.getState().roundtables[0].id;
    expect(controller.getState().activeThinkTankRoundtableId).toBe(roundtableId);
  });

  it("dismissing the board clears the active table without touching the transcript", async () => {
    const { controller, agentGateway } = await buildController();

    await controller.conveneThinkTank("A random topic");
    await new Promise(resolve => setTimeout(resolve, 0));

    controller.dismissThinkTank();

    expect(controller.getState().activeThinkTankRoundtableId).toBeNull();
    // The transcript itself survives — dismissing hides the board, it doesn't delete
    // anything.
    expect(controller.getState().workspaceAgent.messages.length).toBeGreaterThan(0);
  });

  it("does nothing for a blank topic", async () => {
    const { controller, agentGateway } = await buildController();
    controller.closeWorkspaceAgent();

    await controller.conveneThinkTank("   ");

    expect(agentGateway.designCalls).toHaveLength(0);
    expect(controller.getState().workspaceAgent.isOpen).toBe(false);
  });

  it("reports, rather than throws, when the provider can't design a panel", async () => {
    // A gateway with no `designRoundtable` at all — the honest "this build can't do that"
    // case `CreateRoundtableInteractor` is built to report.
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
      searchGateway: new StubSearchGateway(),
      extractionGateway: new StubExtractionGateway(),
    });
    await controller.init();
    controller.setOpenRouterKey("sk-test-key");
    controller.closeWorkspaceAgent();

    await controller.conveneThinkTank("Anything");

    expect(controller.getState().roundtables).toHaveLength(0);
    expect(controller.getState().workspaceAgent.isOpen).toBe(false);
    expect(controller.getState().toastMessage).toBeTruthy();
  });
});

describe("retryReply and rethinkReply", () => {
  it("retry re-asks the same persona the same question, as a new post", async () => {
    const { controller, agentGateway } = await buildController();
    await controller.conveneThinkTank("A random topic");
    await new Promise(resolve => setTimeout(resolve, 0));

    const before = controller.getState().workspaceAgent.messages;
    const firstReply = before.find(m => m.speaker === "assistant")!;
    const messagesBeforeRetry = before.length;
    agentGateway.turnCalls = [];

    controller.retryReply(firstReply.id);
    await new Promise(resolve => setTimeout(resolve, 0));

    const after = controller.getState().workspaceAgent.messages;
    // A retry is an ordinary send: the question is re-posted, then the new reply — two
    // new posts, and the original reply is untouched rather than edited in place.
    expect(after.length).toBe(messagesBeforeRetry + 2);
    expect(after.find(m => m.id === firstReply.id)?.text).toBe(firstReply.text);
    // Only the one persona was re-asked, not the whole panel.
    expect(agentGateway.turnCalls).toHaveLength(1);
    expect(agentGateway.turnCalls[0].briefing).toContain("A random topic");
  });

  it("rethink asks the persona to look at its own reply again", async () => {
    const { controller, agentGateway } = await buildController();
    await controller.conveneThinkTank("A random topic");
    await new Promise(resolve => setTimeout(resolve, 0));

    const firstReply = controller.getState().workspaceAgent.messages.find(
      m => m.speaker === "assistant"
    )!;
    agentGateway.turnCalls = [];

    controller.rethinkReply(firstReply.id);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(agentGateway.turnCalls).toHaveLength(1);
    // The follow-up quotes what was actually said, not a generic "try again".
    expect(agentGateway.turnCalls[0].briefing).toContain(firstReply.text);
  });

  it("does nothing for a message with no persona", async () => {
    const { controller, agentGateway } = await buildController();
    await controller.conveneThinkTank("A random topic");
    await new Promise(resolve => setTimeout(resolve, 0));

    const userMessage = controller.getState().workspaceAgent.messages.find(
      m => m.speaker === "user"
    )!;
    agentGateway.turnCalls = [];

    controller.retryReply(userMessage.id);
    controller.rethinkReply(userMessage.id);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(agentGateway.turnCalls).toHaveLength(0);
  });
});
