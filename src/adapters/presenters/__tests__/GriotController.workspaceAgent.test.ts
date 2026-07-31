import { describe, expect, it, beforeEach } from "bun:test";
import { GriotController } from "../GriotController";
import { MemoryCardRepository } from "../../repositories/MemoryCardRepository";
import { MemoryWorkspaceRepository } from "../../repositories/MemoryWorkspaceRepository";
import { MemorySettingsRepository } from "../../repositories/MemorySettingsRepository";
import { MemoryCommandDefinitionRepository } from "../../repositories/MemoryCommandDefinitionRepository";
import { MemoryCardTypeRepository } from "../../repositories/MemoryCardTypeRepository";
import { MemoryPromptPresetRepository } from "../../repositories/MemoryPromptPresetRepository";
import { MemoryAssistantProfileRepository } from "../../repositories/MemoryAssistantProfileRepository";
import { AgentGateway, AgentModel, AgentAskResult, WorkspaceAgentTurnResult } from "../../../usecases/ports/gateways/AgentGateway";
import { SearchGateway, SearchResult } from "../../../usecases/ports/gateways/SearchGateway";
import { ExtractionGateway } from "../../../usecases/ports/gateways/ExtractionGateway";
import { Card } from "../../../entities/card";

/**
 * Phase D: confirming a Workspace Agent proposal dispatches to the real interactor for
 * its tool type. These tests drive the whole path through `GriotController` (not just
 * `WorkspaceAgentWorkflow`) so the actual card/group/chunk/extract effects, the
 * `OperationRecord` this produces, and the "search never runs merely because it was
 * proposed" invariant are all exercised for real.
 */

class StubAgentGateway implements AgentGateway {
  nextTurnRaw: unknown = null;
  turnCalls = 0;

  async ask(query: string, contextCards: Card[], apiKey: string, model: string): Promise<AgentAskResult> {
    return { cards: [], isLocalFallback: true };
  }
  async fetchModels(): Promise<AgentModel[]> {
    return [];
  }
  async designWorkspaceAgentTurn(): Promise<WorkspaceAgentTurnResult> {
    this.turnCalls += 1;
    return { raw: this.nextTurnRaw };
  }
}

class StubExtractionGateway implements ExtractionGateway {
  calls: string[] = [];
  async extractText(url: string): Promise<string> {
    this.calls.push(url);
    return `Extracted content from ${url}`;
  }
}

class StubSearchGateway implements SearchGateway {
  calls: string[] = [];
  async search(query: string): Promise<SearchResult[]> {
    this.calls.push(query);
    return [{ title: `Result for ${query}`, url: "https://example.com/x", snippet: "..." }];
  }
}

async function buildController() {
  const cardRepo = new MemoryCardRepository();
  const workspaceRepo = new MemoryWorkspaceRepository();
  const settingsRepo = new MemorySettingsRepository();
  const agentGateway = new StubAgentGateway();
  const commandDefinitionRepo = new MemoryCommandDefinitionRepository();
  const cardTypeRepo = new MemoryCardTypeRepository();
  const promptPresetRepo = new MemoryPromptPresetRepository();
  const assistantProfileRepo = new MemoryAssistantProfileRepository();
  const extractionGateway = new StubExtractionGateway();
  const searchGateway = new StubSearchGateway();

  const controller = new GriotController({
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

  await controller.init();
  controller.setOpenRouterKey("sk-test-key");
  controller.setSelectedModel("test/model");

  return { controller, cardRepo, agentGateway, extractionGateway, searchGateway };
}

/** Opens the sheet, primes the mock turn, sends a message, and returns the proposal id. */
async function proposeAndGetId(
  controller: GriotController,
  agentGateway: StubAgentGateway,
  tool: unknown,
): Promise<string> {
  controller.openWorkspaceAgent();
  agentGateway.nextTurnRaw = {
    message: "Here's what I'd do.",
    proposedActions: [
      { id: "p1", label: "Do it", explanation: "Because", tool },
    ],
  };
  controller.sendWorkspaceAgentMessage("please help");
  // sendWorkspaceAgentMessage is fire-and-forget; wait a tick for the turn to resolve.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return "p1";
}

describe("GriotController — Workspace Agent Phase D dispatch", () => {
  it("does not create anything merely from a proposal — only confirm dispatches", async () => {
    const { controller, cardRepo, agentGateway } = await buildController();
    const workspaceId = controller.getState().activeWorkspaceId!;
    const note = await controller.createNote({ content: "note body", title: "Note" });

    await proposeAndGetId(controller, agentGateway, {
      type: "create_group",
      name: "New group",
      cardIds: [note.id],
    });

    const cardsBefore = await cardRepo.getCardsByWorkspace(workspaceId);
    expect(cardsBefore.some((c) => c.type === "group")).toBe(false);
  });

  it("create_group dispatches to GroupCardsInteractor with the given cardIds/name and records an operation", async () => {
    const { controller, agentGateway } = await buildController();
    const note = await controller.createNote({ content: "note body", title: "Note" });

    const id = await proposeAndGetId(controller, agentGateway, {
      type: "create_group",
      name: "New group",
      cardIds: [note.id],
    });
    await controller.confirmWorkspaceAgentAction(id);

    const state = controller.getState();
    const proposal = state.workspaceAgent.proposals.find((p) => p.id === id)!;
    expect(proposal.status).toBe("done");
    expect(proposal.resultMessage).toContain("New group");
    expect(state.cards.some((c) => c.type === "group" && c.title === "New group")).toBe(true);
    const grouped = state.cards.find((c) => c.id === note.id);
    expect(grouped?.parentId).toBe(state.cards.find((c) => c.title === "New group")!.id);
  });

  it("a failing GroupCardsInteractor leaves no partial state and surfaces a failure message", async () => {
    const { controller, agentGateway } = await buildController();
    const note = await controller.createNote({ content: "note body", title: "Note" });

    const id = await proposeAndGetId(controller, agentGateway, {
      type: "create_group",
      name: "Bad group",
      cardIds: [note.id],
    });
    // The card is removed between proposal and confirm (e.g. deleted in another tab) —
    // GroupCardsInteractor.execute then throws EmptySelectionError. No group must exist,
    // and the proposal must show a truthful failure, not a silent stuck state.
    await controller.deleteCard(note.id);

    await controller.confirmWorkspaceAgentAction(id);

    const state = controller.getState();
    const proposal = state.workspaceAgent.proposals.find((p) => p.id === id)!;
    expect(proposal.status).toBe("failed");
    expect(state.cards.some((c) => c.type === "group")).toBe(false);
  });

  it("create_cards dispatches to card creation with Provenance.mode = 'agent'", async () => {
    const { controller, agentGateway } = await buildController();

    const id = await proposeAndGetId(controller, agentGateway, {
      type: "create_cards",
      cards: [{ type: "note", title: "Agent note", body: "Body text" }],
    });
    await controller.confirmWorkspaceAgentAction(id);

    const state = controller.getState();
    const created = state.cards.find((c) => c.title === "Agent note");
    expect(created).toBeDefined();
    expect(created!.provenance?.mode).toBe("agent");
    expect(state.workspaceAgent.proposals.find((p) => p.id === id)!.status).toBe("done");
  });

  it("extract_url dispatches to ExtractUrlInteractor for the given cardId", async () => {
    const { controller, agentGateway, extractionGateway } = await buildController();
    // extractUrlToCard is the existing manual path — reuse it to get a real source card
    // with a `cite` on it, so the agent proposal has something valid to reference.
    await controller.extractUrlToCard("https://example.com/original", "Source");
    extractionGateway.calls = [];
    const source = controller.getState().cards.find((c) => c.title === "Source")!;

    const id = await proposeAndGetId(controller, agentGateway, {
      type: "extract_url",
      cardId: source.id,
    });
    await controller.confirmWorkspaceAgentAction(id);

    expect(extractionGateway.calls).toEqual(["https://example.com/original"]);
    const state = controller.getState();
    expect(state.workspaceAgent.proposals.find((p) => p.id === id)!.status).toBe("done");
    expect(
      state.cards.some((c) => c.body === "Extracted content from https://example.com/original" && c.id !== source.id),
    ).toBe(true);
  });

  it("search_web opens the research preflight but never calls SearchGateway directly on confirm", async () => {
    const { controller, agentGateway, searchGateway } = await buildController();

    const id = await proposeAndGetId(controller, agentGateway, {
      type: "search_web",
      queries: ["eigenvectors"],
      purpose: "background reading",
    });
    await controller.confirmWorkspaceAgentAction(id);

    expect(searchGateway.calls).toEqual([]);
    const state = controller.getState();
    expect(state.activePreflightPresetId).toBe("research-web");
    expect(state.preflightQuery).toBe("eigenvectors");
    expect(state.workspaceAgent.proposals.find((p) => p.id === id)!.status).toBe("done");
  });

  it("make_study_candidates creates candidate cards but never enrolls them into review", async () => {
    const { controller, agentGateway } = await buildController();
    const source = await controller.createNote({ content: "concept body", title: "Concept" });

    const id = await proposeAndGetId(controller, agentGateway, {
      type: "make_study_candidates",
      cardIds: [source.id],
      mode: "recall",
    });
    await controller.confirmWorkspaceAgentAction(id);

    const state = controller.getState();
    const candidate = state.cards.find((c) => c.title.startsWith("Recall:"));
    expect(candidate).toBeDefined();
    expect(candidate!.schedule).toBeUndefined();
    expect(state.workspaceAgent.proposals.find((p) => p.id === id)!.status).toBe("done");
  });

  it("link_cards creates exactly one CardLink, produces an OperationRecord, and shows up as a linked note", async () => {
    const { controller, agentGateway } = await buildController();
    const a = await controller.createNote({ content: "a", title: "A" });
    const b = await controller.createNote({ content: "b", title: "B" });

    const id = await proposeAndGetId(controller, agentGateway, {
      type: "link_cards",
      sourceCardId: a.id,
      targetCardId: b.id,
      relation: "Related to",
    });
    await controller.confirmWorkspaceAgentAction(id);

    const state = controller.getState();
    const proposal = state.workspaceAgent.proposals.find((p) => p.id === id)!;
    expect(proposal.status).toBe("done");
    expect(proposal.resultMessage).toContain("A");
    expect(proposal.resultMessage).toContain("B");
    // No new cards, no crash — nothing was fabricated beyond the link itself.
    expect(state.cards.length).toBe(2);
    expect(state.undoableOperationId).not.toBeNull();

    controller.openCard(a.id);
    const linked = controller.getState().linkedCardsForOpenCard;
    expect(linked).toHaveLength(1);
    expect(linked[0]).toMatchObject({ cardId: b.id, title: "B", relation: "Related to" });
  });

  it("a second identical link_cards confirm doesn't duplicate the link", async () => {
    const { controller, agentGateway } = await buildController();
    const a = await controller.createNote({ content: "a", title: "A" });
    const b = await controller.createNote({ content: "b", title: "B" });

    const id = await proposeAndGetId(controller, agentGateway, {
      type: "link_cards",
      sourceCardId: a.id,
      targetCardId: b.id,
    });
    await controller.confirmWorkspaceAgentAction(id);
    // Confirming the same (already "done") proposal again is a no-op at the workflow
    // level — see `WorkspaceAgentWorkflow.confirmProposal`'s `status !== "proposed"` guard.
    await controller.confirmWorkspaceAgentAction(id);

    controller.openCard(a.id);
    expect(controller.getState().linkedCardsForOpenCard).toHaveLength(1);
  });

  it("ask_clarifying_question is a documented no-op, not a fabricated execution", async () => {
    const { controller, agentGateway } = await buildController();

    const id = await proposeAndGetId(controller, agentGateway, {
      type: "ask_clarifying_question",
      question: "Which source did you mean?",
    });
    await controller.confirmWorkspaceAgentAction(id);

    const state = controller.getState();
    expect(state.workspaceAgent.proposals.find((p) => p.id === id)!.status).toBe("done");
    expect(state.cards.length).toBe(0);
  });
});
