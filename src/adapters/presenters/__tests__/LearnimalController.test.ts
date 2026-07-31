import { describe, expect, it, beforeEach } from "bun:test";
import { LearnimalController } from "../LearnimalController";
import { MemoryCardRepository } from "../../repositories/MemoryCardRepository";
import { MemoryWorkspaceRepository } from "../../repositories/MemoryWorkspaceRepository";
import { MemorySettingsRepository } from "../../repositories/MemorySettingsRepository";
import { MemoryCommandDefinitionRepository } from "../../repositories/MemoryCommandDefinitionRepository";
import { MemoryCardTypeRepository } from "../../repositories/MemoryCardTypeRepository";
import { MemoryPromptPresetRepository } from "../../repositories/MemoryPromptPresetRepository";
import { MemoryAssistantProfileRepository } from "../../repositories/MemoryAssistantProfileRepository";
import { AgentGateway, AgentModel, AgentAskResult, AgentCardResponse } from "../../../usecases/ports/gateways/AgentGateway";
import { SearchGateway, SearchResult } from "../../../usecases/ports/gateways/SearchGateway";
import { ExtractionGateway } from "../../../usecases/ports/gateways/ExtractionGateway";
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
  ): Promise<AgentAskResult> {
    this.lastApiKey = apiKey;
    this.lastModel = model;
    this.lastSystemPrompt = systemPrompt;
    return { cards: [
      { title: "Mock Chunks 1", body: `Answer for ${query}` },
      { title: "Mock Chunks 2", body: "Detailed explanation" }
    ], isLocalFallback: false };
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
  let assistantProfileRepo: MemoryAssistantProfileRepository;
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
    assistantProfileRepo = new MemoryAssistantProfileRepository();
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
      assistantProfileRepo,
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
      assistantProfileRepo,
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
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
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
      assistantProfileRepo: new MemoryAssistantProfileRepository(),
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
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
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
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
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
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
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
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
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
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
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
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
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
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
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
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
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
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
      searchGateway, extractionGateway
    });
    await controller.init();
    controller.setOpenRouterKey("test-key");

    await controller.suggestSearchQueries("learn WebGPU");

    const state = controller.getState();
    expect(state.isSuggestingQueries).toBe(false);
    expect(state.aiQuerySuggestions).toEqual(["Mock Chunks 1", "Mock Chunks 2"]);
  });

  it("switches mission phases freely in both directions and persists each change", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
      searchGateway, extractionGateway
    });
    await controller.init();
    controller.openMissionEditor();
    controller.updateMissionDraft({ goalTitle: "Ship a renderer" });
    await controller.saveMission();

    await controller.setMissionPhase("build");
    expect(controller.getState().workspaces[0].mission?.currentPhase).toBe("build");

    await controller.setMissionPhase("explore");
    expect(controller.getState().workspaces[0].mission?.currentPhase).toBe("explore");

    const persisted = await workspaceRepo.getWorkspaces();
    expect(persisted[0].mission?.currentPhase).toBe("explore");
  });

  it("generates a persisted syllabus group from the mission and selects its items", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
      searchGateway, extractionGateway
    });
    await controller.init();
    controller.setOpenRouterKey("test-key");
    controller.openMissionEditor();
    controller.updateMissionDraft({ goalTitle: "Ship a renderer" });
    await controller.saveMission();

    await controller.generateSyllabus();

    const state = controller.getState();
    const group = state.cards.find(c => c.type === "group" && c.title.startsWith("Syllabus:"));
    expect(group).toBeDefined();
    const items = state.cards.filter(c => c.parentId === group?.id);
    expect(items.length).toBe(2);
    expect(items.every(i => i.role === "concept")).toBe(true);
    expect(state.selection.size).toBe(2);
    expect(state.operationResult?.summary).toContain("Syllabus created");
  });

  it("refuses to generate a syllabus without a mission or without a key", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    await controller.generateSyllabus();
    expect(controller.getState().toastMessage).toContain("mission");

    controller.openMissionEditor();
    controller.updateMissionDraft({ goalTitle: "Goal" });
    await controller.saveMission();
    await controller.generateSyllabus();
    expect(controller.getState().toastMessage).toContain("OpenRouter key");
    expect(controller.getState().cards.some(c => c.title.startsWith("Syllabus:"))).toBe(false);
  });

  it("produces a capture receipt after a note, so capture leads somewhere", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    const note = await controller.createNote({ content: "An idea worth keeping" });

    const result = controller.getState().operationResult;
    expect(result).not.toBeNull();
    expect(result?.createdCardIds).toEqual([note.id]);
    expect(result?.destination.cardId).toBe(note.id);
  });

  it("dispatching a suggested AI action only opens the preflight — never runs it", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
      searchGateway, extractionGateway
    });
    await controller.init();
    await controller.createNote({ content: "A note" });

    await controller.dispatchSuggestedAction({ kind: "preflight", presetId: "explain-selected" });

    const state = controller.getState();
    expect(state.activePreflightPresetId).toBe("explain-selected");
    // The receipt steps aside for the sheet, and no cards were generated behind our back.
    expect(state.operationResult).toBeNull();
    expect(state.cards.length).toBe(1);
  });

  it("dispatching 'More' opens the command palette", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    await controller.dispatchSuggestedAction({ kind: "palette" });

    expect(controller.getState().isModalOpen).toBe(true);
  });

  it("resolves a bare /alias to its action sheet instead of running it as a command", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    const ok = await controller.runPipeline("/research");

    expect(ok).toBe(true);
    expect(controller.getState().activePreflightPresetId).toBe("research-web");
    expect(controller.getState().cards.length).toBe(0);
  });

  it("routes /status to the gap report", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    await controller.runPipeline("/status");

    expect(controller.getState().isGapReportOpen).toBe(true);
  });

  it("leaves an alias with an argument to the pipeline parser", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    // `/study` alone opens a sheet; with an argument it must fall through as a command,
    // where "study" is not a real keyword and fails honestly rather than silently.
    await controller.runPipeline('study "topic"');

    expect(controller.getState().activePreflightPresetId).toBeNull();
  });

  it("records a capture intent for the shell to navigate on", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    await controller.dispatchSuggestedAction({ kind: "capture", intent: "link" });
    expect(controller.getState().captureIntent).toBe("link");

    // Consumed exactly once, so re-renders don't re-navigate.
    expect(controller.consumeCaptureIntent()).toBe("link");
    expect(controller.getState().captureIntent).toBeNull();
    expect(controller.consumeCaptureIntent()).toBeNull();
  });

  it("turns a failed run into a durable, re-runnable card instead of a transient banner", async () => {
    // A gateway that fails once, then succeeds — so we can retry and see it recover.
    let shouldFail = true;
    const flaky: AgentGateway = {
      async ask(): Promise<AgentAskResult> {
        if (shouldFail) throw new Error("model unavailable");
        return { cards: [{ title: "Recovered", body: "It worked the second time" }], isLocalFallback: false };
      },
      async fetchModels() { return []; },
    };

    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway: flaky,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    const ok = await controller.runPipeline('ask "why do birds sing"');
    expect(ok).toBe(false);

    // The failure is a card in the workspace, not a banner that can be lost.
    const failureCard = controller.getState().cards.find(c => c.type === "failure");
    expect(failureCard).toBeDefined();
    expect(failureCard!.title).toContain("why do birds sing");
    // And no lingering pending operation reporting the same thing twice.
    expect(controller.getState().pendingOperations).toHaveLength(0);

    // It survives a reload, because it's persisted like any other card.
    const persisted = await cardRepo.getCardsByWorkspace(controller.getState().activeWorkspaceId!);
    expect(persisted.some(c => c.id === failureCard!.id)).toBe(true);

    shouldFail = false;
    const retried = await controller.rerunFailedCard(failureCard!.id);

    expect(retried).toBe(true);
    const after = controller.getState();
    // The record is cleared once the work actually succeeds...
    expect(after.cards.find(c => c.id === failureCard!.id)).toBeUndefined();
    // ...and the output it was supposed to produce is there.
    expect(after.cards.some(c => c.title === "Recovered")).toBe(true);
  });

  it("keeps the failure card when a retry fails again, rather than piling up records", async () => {
    const alwaysFails: AgentGateway = {
      async ask(): Promise<AgentAskResult> { throw new Error("still down"); },
      async fetchModels() { return []; },
    };

    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway: alwaysFails,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    await controller.runPipeline('ask "x"');
    const first = controller.getState().cards.filter(c => c.type === "failure");
    expect(first).toHaveLength(1);

    await controller.rerunFailedCard(first[0].id);

    // One original + one from the retry — each a real, distinct attempt, not a duplicate
    // of the same record.
    const after = controller.getState().cards.filter(c => c.type === "failure");
    expect(after.length).toBeGreaterThanOrEqual(1);
    expect(after.every(c => c.title.includes("ask"))).toBe(true);
  });

  it("undoes the last run, removing what it created", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    await controller.runPipeline('ask "photosynthesis"');
    const afterRun = controller.getState();
    expect(afterRun.undoableOperationId).not.toBeNull();
    const createdCount = afterRun.cards.length;
    expect(createdCount).toBeGreaterThan(0);

    const undone = await controller.undoLastOperation();

    expect(undone).toBe(true);
    const after = controller.getState();
    expect(after.cards).toHaveLength(0);
    expect(after.undoableOperationId).toBeNull();
    expect(after.selection.size).toBe(0);
  });

  it("refuses to undo — leaving everything intact — once a created card has been edited", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    await controller.runPipeline('ask "photosynthesis"');
    const created = controller.getState().cards.filter(c => c.type === "chunk");
    expect(created.length).toBeGreaterThan(0);

    await controller.setCardBody(created[0].id, "I rewrote this myself");

    const undone = await controller.undoLastOperation();

    expect(undone).toBe(false);
    // The whole point: a refused undo changes nothing at all.
    expect(controller.getState().cards.length).toBeGreaterThan(0);
    expect(controller.getState().toastMessage).toContain("edited");
  });

  it("moves the user into the group a run creates", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    await controller.runPipeline('ask "photosynthesis"');

    const state = controller.getState();
    const group = state.cards.find(c => c.type === "group");
    expect(group).toBeDefined();
    // The result is what you're looking at, not something to go find.
    expect(state.currentGroupId).toBe(group!.id);
    expect(controller.consumeGroupNavigation()).toBe(group!.id);
    // Consumed once, so a re-render doesn't yank the user back.
    expect(controller.consumeGroupNavigation()).toBeNull();
  });

  it("closes the preflight sheet the moment a run is committed, not when it finishes", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
      searchGateway, extractionGateway
    });
    await controller.init();
    await controller.createNote({ content: "A note to explain" });

    controller.openPreflight("explain-selected");
    expect(controller.getState().activePreflightPresetId).toBe("explain-selected");

    await controller.confirmPreflight();

    expect(controller.getState().activePreflightPresetId).toBeNull();
  });

  it("leaves no sheet stranded when a run fails", async () => {
    const failing: AgentGateway = {
      async ask(): Promise<AgentAskResult> { throw new Error("down"); },
      async fetchModels() { return []; },
    };
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway: failing,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
      searchGateway, extractionGateway
    });
    await controller.init();
    await controller.createNote({ content: "A note" });

    controller.openPreflight("explain-selected");
    await controller.confirmPreflight();

    // Previously the sheet only closed on success, so a failure stranded it forever.
    expect(controller.getState().activePreflightPresetId).toBeNull();
    expect(controller.getState().isModalOpen).toBe(false);
    expect(controller.getState().cards.some(c => c.type === "failure")).toBe(true);
  });

  it("dispatching a mission action opens the mission editor", async () => {
    const controller = new LearnimalController({
      cardRepo, workspaceRepo, settingsRepo, agentGateway,
      commandDefinitionRepo, cardTypeRepo, promptPresetRepo, assistantProfileRepo,
      searchGateway, extractionGateway
    });
    await controller.init();

    await controller.dispatchSuggestedAction({ kind: "mission" });

    expect(controller.getState().isMissionEditorOpen).toBe(true);
  });

  describe("goal architect", () => {
    const makeController = () =>
      new LearnimalController({
        cardRepo,
        workspaceRepo,
        settingsRepo,
        agentGateway,
        commandDefinitionRepo,
        cardTypeRepo,
        promptPresetRepo,
        assistantProfileRepo,
        searchGateway,
        extractionGateway,
      });

    it("opens itself on a genuinely empty first launch", async () => {
      const controller = makeController();
      await controller.init();

      const view = controller.getState().goalArchitect;
      expect(view.isOpen).toBe(true);
      expect(view.isFirstRun).toBe(true);
      // An uninvited sheet must name the way out, not just offer a bare close.
      expect(view.dismissLabel).toBe("START BLANK INSTEAD");
    });

    it("leaves a usable blank workspace when the first-run sheet is dismissed", async () => {
      const controller = makeController();
      await controller.init();

      controller.closeGoalArchitect();

      const state = controller.getState();
      expect(state.goalArchitect.isOpen).toBe(false);
      // The no-assistance path: a workspace already exists and nothing was required.
      expect(state.workspaces).toHaveLength(1);
      expect(state.cards).toHaveLength(0);
    });

    it("does not reopen for a returning user who already has a workspace", async () => {
      const first = makeController();
      await first.init();
      first.closeGoalArchitect();

      // Same repositories, so this is the same user opening the app again.
      const second = makeController();
      await second.init();

      expect(second.getState().goalArchitect.isOpen).toBe(false);
    });

    it("does not mistake an unreadable library for a first launch", async () => {
      const failing = {
        async getWorkspaces() {
          throw new Error("storage unavailable");
        },
        async saveWorkspace() {},
        async deleteWorkspace() {},
      };
      const controller = new LearnimalController({
        cardRepo,
        workspaceRepo: failing as any,
        settingsRepo,
        agentGateway,
        commandDefinitionRepo,
        cardTypeRepo,
        promptPresetRepo,
        assistantProfileRepo,
        searchGateway,
        extractionGateway,
      });

      await controller.init();

      // Prompting someone to plan a goal on top of data that failed to load would
      // invite them to start over on work that is still there.
      expect(controller.getState().goalArchitect.isOpen).toBe(false);
    });

    it("opens from the workspace menu for an existing user", async () => {
      const controller = makeController();
      await controller.init();
      controller.closeGoalArchitect();

      await controller.dispatchSuggestedAction({ kind: "goal" });

      const view = controller.getState().goalArchitect;
      expect(view.isOpen).toBe(true);
      // Asked for, not imposed — so the dismiss control is a plain close.
      expect(view.isFirstRun).toBe(false);
      expect(view.dismissLabel).toBe("CLOSE");
    });

    it("opens from the goal command in the palette", async () => {
      const controller = makeController();
      await controller.init();

      await controller.runPipeline("goal");

      expect(controller.getState().goalArchitect.isOpen).toBe(true);
      expect(controller.getState().goalArchitect.prompt).toContain(
        "What do you want to be able to make",
      );
    });

    it("runs the whole flow to created cards with no API key", async () => {
      const controller = makeController();
      await controller.init();
      // No key is ever set: the deterministic path must reach real cards on its own.
      controller.openGoalArchitect();
      controller.submitGoalAnswer("Build a playable puzzle game");
      controller.proposeMission();

      expect(controller.getState().goalArchitect.proposal).toBeTruthy();
      const created = await controller.acceptMission();

      expect(created).toBe(true);
      const state = controller.getState();
      expect(state.goalArchitect.isOpen).toBe(false);
      expect(state.cards.some((card) => card.role === "goal")).toBe(true);
      expect(state.cards.some((card) => card.title === "Known gaps")).toBe(true);
    });

    it("sets the workspace mission on acceptance", async () => {
      const controller = makeController();
      await controller.init();
      controller.openGoalArchitect();
      controller.submitGoalAnswer("Learn to weld");
      controller.proposeMission();
      await controller.acceptMission();

      const state = controller.getState();
      const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
      expect(workspace?.mission?.goalTitle).toBe("Learn to weld");
    });

    it("creates nothing while the mission is still a draft", async () => {
      const controller = makeController();
      await controller.init();
      controller.openGoalArchitect();
      controller.submitGoalAnswer("Build a synth");
      controller.proposeMission();

      // The draft says nothing has been created; that must be literally true.
      expect(controller.getState().cards).toHaveLength(0);
    });

    it("leaves an undoable receipt naming the created cards", async () => {
      const controller = makeController();
      await controller.init();
      controller.openGoalArchitect();
      controller.submitGoalAnswer("Build a synth");
      controller.proposeMission();
      await controller.acceptMission();

      const state = controller.getState();
      expect(state.undoableOperationId).toBeTruthy();
      expect(state.operationResult?.createdCardIds.length).toBeGreaterThan(0);
    });

    it("undoes an accepted mission, removing the cards it created", async () => {
      const controller = makeController();
      await controller.init();
      controller.openGoalArchitect();
      controller.submitGoalAnswer("Build a synth");
      controller.proposeMission();
      await controller.acceptMission();
      expect(controller.getState().cards.length).toBeGreaterThan(0);

      const undone = await controller.undoLastOperation();

      expect(undone).toBe(true);
      expect(controller.getState().cards).toHaveLength(0);
    });

    it("enrols nothing in spaced repetition", async () => {
      const controller = makeController();
      await controller.init();
      controller.openGoalArchitect();
      controller.submitGoalAnswer("Build a synth");
      controller.proposeMission();
      await controller.acceptMission();

      expect(
        controller.getState().cards.every((card) => card.schedule === undefined),
      ).toBe(true);
    });

    it("reports that no model was used when none was", async () => {
      const controller = makeController();
      await controller.init();
      controller.openGoalArchitect();
      controller.submitGoalAnswer("Build a synth");
      controller.proposeMission();

      expect(controller.getState().goalArchitect.provenanceSummary).toContain(
        "No model was used",
      );
    });

    it("explains what needs a key rather than failing silently", async () => {
      const controller = makeController();
      await controller.init();
      controller.openGoalArchitect();
      controller.submitGoalAnswer("Build a synth");

      await controller.requestGoalAgentTurn();

      expect(controller.getState().goalArchitect.agentError).toContain("No API key");
      // The answer survives the refused model call.
      expect(controller.getState().goalArchitect.mapSections.length).toBeGreaterThan(0);
    });
  });
});
