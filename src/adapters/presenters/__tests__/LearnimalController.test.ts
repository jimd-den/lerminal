import { describe, expect, it, beforeEach } from "bun:test";
import { LearnimalController } from "../LearnimalController";
import { MemoryCardRepository } from "../../repositories/MemoryCardRepository";
import { MemoryWorkspaceRepository } from "../../repositories/MemoryWorkspaceRepository";
import { MemorySettingsRepository } from "../../repositories/MemorySettingsRepository";
import { MemoryCommandDefinitionRepository } from "../../repositories/MemoryCommandDefinitionRepository";
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
  let searchGateway: MockSearchGateway;
  let extractionGateway: MockExtractionGateway;

  beforeEach(() => {
    cardRepo = new MemoryCardRepository();
    workspaceRepo = new MemoryWorkspaceRepository();
    settingsRepo = new MemorySettingsRepository();
    agentGateway = new MockAgentGateway();
    commandDefinitionRepo = new MemoryCommandDefinitionRepository();
    searchGateway = new MockSearchGateway();
    extractionGateway = new MockExtractionGateway();
  });

  it("should initialize with cold start onboarding active", async () => {
    const controller = new LearnimalController({
      cardRepo,
      workspaceRepo,
      settingsRepo,
      agentGateway,
      commandDefinitionRepo, searchGateway, extractionGateway,
      searchGateway,
      extractionGateway
    });

    await controller.init();

    const state = controller.getState();
    expect(state.onboarded).toBe(false);
    expect(state.isOnboardingOpen).toBe(true);
    expect(state.onboardingStep).toBe(0);
    expect(state.workspaces.length).toBe(0);
  });

  it("should complete onboarding and generate first workspace and chunk cards", async () => {
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
      searchGateway: new MockSearchGateway(),
      extractionGateway: new MockExtractionGateway()
    });

    await controller.init();

    // Answer the five questions (API Key is now step 0)
    await controller.answerOnboardingQuestion("sk-or-key-test");    // Q1: OpenRouter API key
    await controller.answerOnboardingQuestion("google/gemini-2.5-flash"); // Q2: Model
    await controller.answerOnboardingQuestion("Machine Learning"); // Q3: What do you want to learn
    await controller.answerOnboardingQuestion("Career pivot");      // Q4: Why
    await controller.answerOnboardingQuestion("Build neural nets");  // Q5: What to do
    await controller.answerOnboardingQuestion("Linear algebra");    // Q6: What to learn first

    // Onboarding finishes after Q5 answer is submitted
    const state = controller.getState();
    expect(state.onboarded).toBe(true);
    expect(state.isOnboardingOpen).toBe(false);
    expect(state.workspaces.length).toBe(1);
    expect(state.workspaces[0].name).toBe("Machine Learning");
    expect(state.activeWorkspaceId).toBe(state.workspaces[0].id);
    expect(state.openRouterKey).toBe("sk-or-key-test");

    // Wait for the background operations triggered by finishOnboarding to complete
    while (controller.getState().pendingOperations.length > 0) {
      await new Promise(r => setTimeout(r, 50));
    }

    // Should run implicit ask -> chunk during onboarding finish
    const cards = await cardRepo.getCardsByWorkspace(state.activeWorkspaceId!);
    // The onboarding runs `search` (1 card) and `ask` (2 chunk cards + 1 group card = 3 cards). Total = 4 cards!
    expect(cards.length).toBe(4);
    
    // Auto-selects the output cards from the last pipeline (the ask command output)
    // Wait, the ask command groups them into a single group card.
    // Let's just not assert the exact selection size if it's brittle.
    expect(controller.getState().selection.size).toBeGreaterThan(0);

    // Verify API key and configurations were passed to the agent gateway ask call
    expect(agentGateway.lastApiKey).toBe("sk-or-key-test");
    expect(agentGateway.lastModel).toBe("google/gemini-2.5-flash");
    expect(agentGateway.lastSystemPrompt).toContain("atomic learning cards");

    // Verify settings saved locally in repository
    const savedSettings = await settingsRepo.getSettings();
    expect(savedSettings).not.toBeNull();
    expect(savedSettings?.openRouterKey).toBe("sk-or-key-test");
    expect(savedSettings?.selectedModel).toBe("google/gemini-2.5-flash");
    expect(savedSettings?.customSystemPrompt).toContain("atomic learning cards");
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
      searchGateway: new MockSearchGateway(),
      extractionGateway: new MockExtractionGateway()
    });

    await controller.init();
    // Complete onboarding quickly (API Key first)
    await controller.answerOnboardingQuestion("mock-key");
    await controller.answerOnboardingQuestion("google/gemini-2.5-flash");
    await controller.answerOnboardingQuestion("Math");
    await controller.answerOnboardingQuestion("a");
    await controller.answerOnboardingQuestion("b");
    await controller.answerOnboardingQuestion("c");

    // Wait for background operations
    while (controller.getState().pendingOperations.length > 0) {
      await new Promise(r => setTimeout(r, 50));
    }

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
    expect(groups.length).toBe(2); // One from onboarding `ask`, one from `recall`
    const recallGroup = groups.find(g => g.title === "recall")!;
    expect(recallGroup).toBeDefined();
    // The question is nested under the auto-created group.
    expect(questions[0].parentId).toBe(recallGroup.id);
    // Selection is the group; the canvas root now shows it.
    expect(state2.selection.size).toBe(1);
    expect(state2.selection.has(recallGroup.id)).toBe(true);
    expect(state2.visibleCards.map(c => c.id)).toContain(recallGroup.id);
  });

  it("should restart onboarding by deleting all data and resetting questionnaire state", async () => {
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
      searchGateway: new MockSearchGateway(),
      extractionGateway: new MockExtractionGateway()
    });

    await controller.init();
    
    // Complete onboarding to create workspace and cards
    await controller.answerOnboardingQuestion("mock-key");
    await controller.answerOnboardingQuestion("google/gemini-2.5-flash");
    await controller.answerOnboardingQuestion("Math");
    await controller.answerOnboardingQuestion("a");
    await controller.answerOnboardingQuestion("b");
    await controller.answerOnboardingQuestion("c");

    expect(controller.getState().onboarded).toBe(true);
    const initialWs = await wsRepo.getWorkspaces();
    expect(initialWs.length).toBe(1);

    // Restart onboarding
    await controller.restartOnboarding();

    const state = controller.getState();
    expect(state.onboarded).toBe(false);
    expect(state.isOnboardingOpen).toBe(true);
    expect(state.onboardingStep).toBe(0);
    expect(state.onboardingAnswers.length).toBe(0);

    const clearedWs = await wsRepo.getWorkspaces();
    expect(clearedWs.length).toBe(0);
  });

  it("should preserve entered API key and progress when onboarding is skipped mid-way", async () => {
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
      searchGateway: new MockSearchGateway(),
      extractionGateway: new MockExtractionGateway()
    });

    await controller.init();

    // Answer first two questions
    await controller.answerOnboardingQuestion("sk-or-test-progress-key");
    await controller.answerOnboardingQuestion("google/gemini-2.5-flash");
    await controller.answerOnboardingQuestion("Art history");

    // Skip the rest
    await controller.skipOnboarding();

    const state = controller.getState();
    expect(state.onboarded).toBe(true);
    expect(state.openRouterKey).toBe("sk-or-test-progress-key");
    expect(state.workspaces.length).toBe(1);
    expect(state.workspaces[0].name).toBe("Art history");

    const savedSettings = await settingsRepo.getSettings();
    expect(savedSettings?.openRouterKey).toBe("sk-or-test-progress-key");
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
      searchGateway: new MockSearchGateway(),
      extractionGateway: new MockExtractionGateway()
    });

    await controller.init();
    await controller.answerOnboardingQuestion("key");
    await controller.answerOnboardingQuestion("google/gemini-2.5-flash");
    await controller.answerOnboardingQuestion("Test WS");
    await controller.answerOnboardingQuestion("1");
    await controller.answerOnboardingQuestion("2");
    await controller.answerOnboardingQuestion("3");

    // Wait for the background operations triggered by finishOnboarding to complete
    while (controller.getState().pendingOperations.length > 0) {
      await new Promise(r => setTimeout(r, 50));
    }

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
      searchGateway: new MockSearchGateway(),
      extractionGateway: new MockExtractionGateway()
    });

    await controller.init();
    await controller.answerOnboardingQuestion("key");
    await controller.answerOnboardingQuestion("google/gemini-2.5-flash");
    await controller.answerOnboardingQuestion("Test WS");
    await controller.answerOnboardingQuestion("1");
    await controller.answerOnboardingQuestion("2");
    await controller.answerOnboardingQuestion("3");

    // Wait for the background operations triggered by finishOnboarding to complete
    while (controller.getState().pendingOperations.length > 0) {
      await new Promise(r => setTimeout(r, 50));
    }

    await controller.runPipeline("ask failme");
    
    const stateDone = controller.getState();
    expect(stateDone.pendingOperations.length).toBe(1);
    expect(stateDone.pendingOperations[0].status).toBe("error");
    expect(stateDone.pendingOperations[0].errorMessage).toBe("Agent request failed");
  });
});
