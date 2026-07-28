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

  it("should support direct note creation via createNote method", async () => {
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
    const note = await controller.createNote({
      content: "Direct capture note",
      title: "Direct Title"
    });

    expect(note).toBeDefined();
    expect(note.type).toBe("note");
    expect(note.title).toBe("Direct Title");
    expect(note.body).toBe("Direct capture note");

    const state = controller.getState();
    expect(state.cards.some(c => c.id === note.id)).toBe(true);
  });

  it("should open input sheet in 'note' mode for quick note capture", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    controller.setInputSheetOpen(true, "note");
    const state = controller.getState();

    expect(state.isInputSheetOpen).toBe(true);
    expect(state.inputSheetMode).toBe("note");
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

  it("routes completed operations to an explicit result destination", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    await controller.runPipeline('source "A | concise \\"source\\" passage"');

    const completed = controller.getState();
    expect(completed.operationResult?.summary).toBe("1 item created");
    expect(completed.operationResult?.destination.spaceId).toBe(completed.activeWorkspaceId);
    expect(completed.operationResult?.createdCardIds).toEqual([...completed.selection]);
    expect(completed.cards[0].body).toBe('A | concise "source" passage');

    await controller.openOperationResult();
    expect(controller.getState().operationResult).toBeNull();
  });

  it("deletes a multi-card selection through one controller boundary", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo,
      searchGateway, extractionGateway
    });
    await controller.init();
    const first = await controller.createNote({ content: "First note" });
    const second = await controller.createNote({ content: "Second note" });
    controller.clearSelection();
    controller.toggleSelect(first.id);
    controller.toggleSelect(second.id);

    await controller.deleteSelection(true);

    expect(controller.getState().cards).toHaveLength(0);
    expect(controller.getState().selection.size).toBe(0);
  });

  it("computes a deterministic gap report with no mission set, requiring no API key", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    const state = controller.getState();
    expect(state.gapReport).not.toBeNull();
    expect(state.gapReport?.hasMission).toBe(false);
    expect(state.openRouterKey).toBe("");
  });

  it("saves a mission through the mission editor draft and reflects it in the gap report", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    controller.openMissionEditor();
    controller.updateMissionDraft({ goalTitle: "Ship a renderer", targetDeliverable: "A working demo" });
    controller.addMissionCriterion("Renders a textured cube");
    await controller.saveMission();

    const state = controller.getState();
    expect(state.isMissionEditorOpen).toBe(false);
    expect(state.gapReport?.hasMission).toBe(true);
    expect(state.gapReport?.missionTitle).toBe("Ship a renderer");
    expect(state.workspaces[0].mission?.successCriteria).toEqual(["Renders a textured cube"]);

    // Persisted, not just in-memory.
    const persisted = await workspaceRepo.getWorkspaces();
    expect(persisted[0].mission?.goalTitle).toBe("Ship a renderer");
  });

  it("refuses to save a mission with an empty goal title", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    controller.openMissionEditor();
    await controller.saveMission();

    expect(controller.getState().isMissionEditorOpen).toBe(true);
    expect(controller.getState().workspaces[0].mission).toBeUndefined();
  });

  it("persists a kept research result as a real source card, with no API key required", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    await controller.startResearch("react hooks");
    const [firstResult] = controller.getState().researchResults;
    expect(firstResult).toBeDefined();

    controller.setResearchKeepState(firstResult.url, "kept");
    await controller.saveResearchResultAsSource(firstResult.url);

    const state = controller.getState();
    expect(state.researchResults[0].savedCardId).toBeDefined();
    expect(state.toastMessage).toContain("Source added");

    const savedCard = state.cards.find(c => c.id === state.researchResults[0].savedCardId);
    expect(savedCard).toBeDefined();
    expect(savedCard?.type).toBe("source");
    expect(savedCard?.cite).toBe(firstResult.url);

    // Actually persisted to the repository, not just in-memory controller state.
    const persisted = await cardRepo.getCardsByWorkspace(state.activeWorkspaceId!);
    expect(persisted.some(c => c.id === savedCard?.id)).toBe(true);
  });

  it("does not create a duplicate card when saving the same research result twice", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    await controller.startResearch("react hooks");
    const [firstResult] = controller.getState().researchResults;

    await controller.saveResearchResultAsSource(firstResult.url);
    await controller.saveResearchResultAsSource(firstResult.url);

    const state = controller.getState();
    const sourceCards = state.cards.filter(c => c.cite === firstResult.url);
    expect(sourceCards.length).toBe(1);
  });

  it("blocks AI query suggestions with a toast when no API key is configured", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    await controller.suggestSearchQueries("learn WebGPU");

    expect(controller.getState().aiQuerySuggestions).toEqual([]);
    expect(controller.getState().toastMessage).toContain("OpenRouter key");
  });

  it("populates AI query suggestions from the agent gateway when a key is configured", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo,
      searchGateway, extractionGateway
    });
    await controller.init();
    controller.setOpenRouterKey("test-key");

    await controller.suggestSearchQueries("learn WebGPU");

    const state = controller.getState();
    expect(state.isSuggestingQueries).toBe(false);
    expect(state.aiQuerySuggestions).toEqual(["Mock Chunks 1", "Mock Chunks 2"]);
  });
});
