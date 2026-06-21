import { describe, expect, it, beforeEach } from "bun:test";
import { LearnimalController } from "../LearnimalController";
import { MemoryCardRepository } from "../../repositories/MemoryCardRepository";
import { MemoryWorkspaceRepository } from "../../repositories/MemoryWorkspaceRepository";
import { MemorySettingsRepository } from "../../repositories/MemorySettingsRepository";
import { MemoryCommandDefinitionRepository } from "../../repositories/MemoryCommandDefinitionRepository";
import { MemoryCardTypeRepository } from "../../repositories/MemoryCardTypeRepository";
import { MemoryPromptPresetRepository } from "../../repositories/MemoryPromptPresetRepository";
import { AgentGateway, AgentModel, AgentCardResponse } from "../../gateways/AgentGateway";
import { SearchGateway, SearchResult } from "../../gateways/SearchGateway";
import { ExtractionGateway } from "../../gateways/ExtractionGateway";
import { Card } from "../../../entities/card";

// Simple mock agent gateway that returns predefined cards
class MockAgentGateway implements AgentGateway {
  lastApiKey?: string;
  lastModel?: string;
  lastSystemPrompt?: string;

  async ask(
    query: string,
    contextCards: Card[],
    apiKey: string,
    model: string,
    systemPrompt?: string
  ): Promise<AgentCardResponse[]> {
    this.lastApiKey = apiKey;
    this.lastModel = model;
    this.lastSystemPrompt = systemPrompt;
    return [
      { title: "Mock Chunks 1", body: `Answer for ${query}` },
      { title: "Mock Chunks 2", body: "Detailed explanation" }
    ];
  }
  async fetchModels(): Promise<AgentModel[]> {
    return [
      { id: "google/gemini-2.5-flash:free", name: "Gemini 2.5 Flash (Free)", free: true },
      { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", free: false }
    ];
  }
}

class MockExtractionGateway implements ExtractionGateway {
  async extractText(url: string): Promise<string> {
    return `Mocked content from ${url}`;
  }
}

class MockSearchGateway implements SearchGateway {
  async search(query: string): Promise<SearchResult[]> {
    return [
      { title: `Result 1 for ${query}`, url: "https://example.com/1", snippet: "Snippet 1" },
      { title: `Result 2 for ${query}`, url: "https://example.com/2", snippet: "Snippet 2" }
    ];
  }
}

describe("Learnimal App Controller", () => {
  let cardRepo: MemoryCardRepository;
  let workspaceRepo: MemoryWorkspaceRepository;
  let settingsRepo: MemorySettingsRepository;
  let agentGateway: MockAgentGateway;
  let commandDefinitionRepo: MemoryCommandDefinitionRepository;
  let cardTypeRepo: MemoryCardTypeRepository;
  let promptPresetRepo: MemoryPromptPresetRepository;
  let searchGateway: MockSearchGateway;
  let extractionGateway: MockExtractionGateway;

  beforeEach(() => {
    cardRepo = new MemoryCardRepository();
    workspaceRepo = new MemoryWorkspaceRepository();
    settingsRepo = new MemorySettingsRepository();
    agentGateway = new MockAgentGateway();
    commandDefinitionRepo = new MemoryCommandDefinitionRepository();
    cardTypeRepo = new MemoryCardTypeRepository();
    promptPresetRepo = new MemoryPromptPresetRepository();
    searchGateway = new MockSearchGateway();
    extractionGateway = new MockExtractionGateway();
  });

  it("should initialize with default workspace", async () => {
    const controller = new LearnimalController({
      cardRepo,
      workspaceRepo,
      settingsRepo,
      agentGateway,
      commandDefinitionRepo,
      cardTypeRepo,
      promptPresetRepo,
      searchGateway,
      extractionGateway
    });

    await controller.init();

    const state = controller.getState();
    expect(state.workspaces.length).toBe(1);
    expect(state.workspaces[0].name).toBe("My Workspace");
    expect(state.activeWorkspaceId).toBe(state.workspaces[0].id);
  });

  it("should persist selected model changes to the settings repository", async () => {
    const cardRepo = new MemoryCardRepository();
    const wsRepo = new MemoryWorkspaceRepository();
    const settingsRepo = new MemorySettingsRepository();
    const agentGateway = new MockAgentGateway();

    const controller = new LearnimalController({
      cardRepo,
      workspaceRepo: wsRepo,
      settingsRepo,
      agentGateway,
      commandDefinitionRepo: new MemoryCommandDefinitionRepository(),
      cardTypeRepo: new MemoryCardTypeRepository(),
      promptPresetRepo: new MemoryPromptPresetRepository(),
      searchGateway: new MockSearchGateway(),
      extractionGateway: new MockExtractionGateway()
    });

    await controller.init();
    
    // Change model
    controller.setSelectedModel("anthropic/claude-3.5-sonnet");
    
    const state = controller.getState();
    expect(state.selectedModel).toBe("anthropic/claude-3.5-sonnet");

    const savedSettings = await settingsRepo.getSettings();
    expect(savedSettings?.selectedModel).toBe("anthropic/claude-3.5-sonnet");
  });

  it("should persist custom system prompt changes to the settings repository", async () => {
    const cardRepo = new MemoryCardRepository();
    const wsRepo = new MemoryWorkspaceRepository();
    const settingsRepo = new MemorySettingsRepository();
    const agentGateway = new MockAgentGateway();

    const controller = new LearnimalController({
      cardRepo,
      workspaceRepo: wsRepo,
      settingsRepo,
      agentGateway,
      commandDefinitionRepo: new MemoryCommandDefinitionRepository(),
      cardTypeRepo: new MemoryCardTypeRepository(),
      promptPresetRepo: new MemoryPromptPresetRepository(),
      searchGateway: new MockSearchGateway(),
      extractionGateway: new MockExtractionGateway()
    });

    await controller.init();
    
    const customPrompt = "You are a specialized math learning assistant.";
    controller.setCustomSystemPrompt(customPrompt);
    
    const state = controller.getState();
    expect(state.customSystemPrompt).toBe(customPrompt);

    const savedSettings = await settingsRepo.getSettings();
    expect(savedSettings?.customSystemPrompt).toBe(customPrompt);
  });

  it("should toggle card selection and run pipes", async () => {
    const cardRepo = new MemoryCardRepository();
    const wsRepo = new MemoryWorkspaceRepository();
    const settingsRepo = new MemorySettingsRepository();
    const agentGateway = new MockAgentGateway();

    const controller = new LearnimalController({
      cardRepo,
      workspaceRepo: wsRepo,
      settingsRepo,
      agentGateway,
      commandDefinitionRepo: new MemoryCommandDefinitionRepository(),
      cardTypeRepo: new MemoryCardTypeRepository(),
      promptPresetRepo: new MemoryPromptPresetRepository(),
      searchGateway: new MockSearchGateway(),
      extractionGateway: new MockExtractionGateway()
    });

    await controller.init();
    await controller.init();
    
    // Wait for initial default workspace and cards
    while (controller.getState().pendingOperations.length > 0) {
      await new Promise(r => setTimeout(r, 50));
    }

    // Now manually run an ask command to populate some cards
    await controller.runPipeline(`ask "Math a b c"`);

    const state1 = controller.getState();
    const cards = await cardRepo.getCardsByWorkspace(state1.activeWorkspaceId!);
    // We want a chunk card to select
    const firstCardId = cards.find(c => c.type === "chunk")!.id;

    // Selection tests
    controller.clearSelection();
    expect(controller.getState().selection.size).toBe(0);

    controller.toggleSelect(firstCardId);
    expect(controller.getState().selection.has(firstCardId)).toBe(true);

    // Pipe execution: chunk selected -> run recall -> outputs a question card, which
    // auto-grouping (on by default) then wraps in a "recall" group. The produced
    // group becomes the new selection.
    await controller.runPipeline("recall");

    const state2 = controller.getState();
    const workspaceCards = await cardRepo.getCardsByWorkspace(state2.activeWorkspaceId!);
    const questions = workspaceCards.filter(c => c.type === "question");
    const groups = workspaceCards.filter(c => c.type === "group");

    expect(questions.length).toBe(1);
    expect(groups.length).toBe(2); // One from `ask`, one from `recall`
    const recallGroup = groups.find(g => g.title === "recall")!;
    expect(recallGroup).toBeDefined();
    // The question is nested under the auto-created group.
    expect(questions[0].parentId).toBe(recallGroup.id);
    // Selection is the group; the canvas root now shows it.
    expect(state2.selection.size).toBe(1);
    expect(state2.selection.has(recallGroup.id)).toBe(true);
    expect(state2.visibleCards.map(c => c.id)).toContain(recallGroup.id);
  });



  it("should track pending AI generation operations", async () => {
    const cardRepo = new MemoryCardRepository();
    const wsRepo = new MemoryWorkspaceRepository();
    const settingsRepo = new MemorySettingsRepository();
    
    // Create a delayed mock gateway to simulate pending state
    class DelayedAgentGateway extends MockAgentGateway {
      async ask(
        query: string,
        contextCards: Card[],
        apiKey: string,
        model: string,
        systemPrompt?: string
      ): Promise<AgentCardResponse[]> {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve([{ title: "Delayed Chunk", body: "Resolved" }]);
          }, 100);
        });
      }
    }
    const agentGateway = new DelayedAgentGateway();

    const controller = new LearnimalController({
      cardRepo,
      workspaceRepo: wsRepo,
      settingsRepo,
      agentGateway,
      commandDefinitionRepo: new MemoryCommandDefinitionRepository(),
      cardTypeRepo: new MemoryCardTypeRepository(),
      promptPresetRepo: new MemoryPromptPresetRepository(),
      searchGateway: new MockSearchGateway(),
      extractionGateway: new MockExtractionGateway()
    });

    await controller.init();
    await controller.init();

    // Initiate the pipeline (which triggers ask under the hood)
    const runPromise = controller.runPipeline("ask something");
    
    // Check state immediately after starting pipeline (should be loading)
    const stateLoading = controller.getState();
    expect(stateLoading.pendingOperations.length).toBeGreaterThan(0);
    expect(stateLoading.pendingOperations[0].status).toBe("loading");
    
    // Wait for pipeline to finish
    await runPromise;
    
    // Check state after pipeline finishes (should be cleared or success)
    const stateDone = controller.getState();
    expect(stateDone.pendingOperations.length).toBe(0);
  });

  it("should track pending AI generation operations and handle errors", async () => {
    const cardRepo = new MemoryCardRepository();
    const wsRepo = new MemoryWorkspaceRepository();
    const settingsRepo = new MemorySettingsRepository();
    
    // Create a mock gateway that rejects only for a specific query
    class ErrorAgentGateway extends MockAgentGateway {
      async ask(
        query: string,
        contextCards: Card[],
        apiKey: string,
        model: string,
        systemPrompt?: string
      ): Promise<AgentCardResponse[]> {
        if (query === "failme") {
          throw new Error("Network timeout");
        }
        return super.ask(query, contextCards, apiKey, model, systemPrompt);
      }
    }
    const agentGateway = new ErrorAgentGateway();

    const controller = new LearnimalController({
      cardRepo,
      workspaceRepo: wsRepo,
      settingsRepo,
      agentGateway,
      commandDefinitionRepo: new MemoryCommandDefinitionRepository(),
      cardTypeRepo: new MemoryCardTypeRepository(),
      promptPresetRepo: new MemoryPromptPresetRepository(),
      searchGateway: new MockSearchGateway(),
      extractionGateway: new MockExtractionGateway()
    });

    await controller.init();
    await controller.init();

    await controller.runPipeline("ask failme");
    
    const stateDone = controller.getState();
    expect(stateDone.pendingOperations.length).toBe(1);
    expect(stateDone.pendingOperations[0].status).toBe("error");
    expect(stateDone.pendingOperations[0].errorMessage).toBe("Agent request failed");
  });
});
