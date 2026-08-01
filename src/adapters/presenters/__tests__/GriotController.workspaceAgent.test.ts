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
  briefings: string[] = [];

  async designWorkspaceAgentTurn(input: { briefing: string }): Promise<WorkspaceAgentTurnResult> {
    this.turnCalls += 1;
    this.briefings.push(input.briefing);
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

/**
 * The context bug: the sheet used to capture the selection once, when it opened, and never
 * knew about the card open in the detail modal — so the commonest flow of all, "tap a card
 * → Ask GRIOT → explain this", sent the model no card content whatsoever.
 */
describe("GriotController — Workspace Agent live card context", () => {
  const send = async (controller: GriotController) => {
    controller.sendWorkspaceAgentMessage("explain this");
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  it("sends the open card's content even with nothing multi-selected", async () => {
    const { controller, agentGateway } = await buildController();
    const note = await controller.createNote({
      content: "MITOCHONDRIA BODY TEXT",
      title: "Mitochondria",
    });
    agentGateway.nextTurnRaw = { message: "ok", proposedActions: [] };
    // Capture auto-selects what it just made; start from a clean selection.
    controller.clearSelection();

    controller.openCard(note.id);
    controller.openWorkspaceAgent();
    await send(controller);

    const briefing = agentGateway.briefings.at(-1)!;
    expect(briefing).toContain("MITOCHONDRIA BODY TEXT");
    expect(briefing).toContain(`[${note.id}] [focus]`);
  });

  it("reflects a selection change made while the sheet is already open", async () => {
    const { controller, agentGateway } = await buildController();
    const first = await controller.createNote({ content: "FIRST BODY", title: "First" });
    const second = await controller.createNote({ content: "SECOND BODY", title: "Second" });
    agentGateway.nextTurnRaw = { message: "ok", proposedActions: [] };

    controller.clearSelection();
    controller.toggleSelect(first.id);
    controller.openWorkspaceAgent();
    // The user changes their mind without closing the sheet.
    controller.toggleSelect(first.id);
    controller.toggleSelect(second.id);
    await send(controller);

    const briefing = agentGateway.briefings.at(-1)!;
    expect(briefing).toContain(`[${second.id}] [focus]`);
    expect(briefing).not.toContain(`[${first.id}] [focus]`);
  });

  it("context chips count exactly the cards being sent — open card plus selection, de-duplicated", async () => {
    const { controller, agentGateway } = await buildController();
    const a = await controller.createNote({ content: "A BODY", title: "Alpha" });
    const b = await controller.createNote({ content: "B BODY", title: "Beta" });
    agentGateway.nextTurnRaw = { message: "ok", proposedActions: [] };

    controller.clearSelection();
    controller.openCard(a.id);
    controller.toggleSelect(a.id);
    controller.toggleSelect(b.id);
    controller.openWorkspaceAgent();

    const view = controller.getState().workspaceAgent;
    expect(view.context.cardCount).toBe(2);
    expect(view.context.focusCardTitle).toBe("Alpha");

    await send(controller);
    const briefing = agentGateway.briefings.at(-1)!;
    expect(briefing).toContain(`[${a.id}] [focus]`);
    expect(briefing).toContain(`[${b.id}] [focus]`);
  });

  it("claims no card context when nothing is open or selected", async () => {
    const { controller } = await buildController();
    await controller.createNote({ content: "unrelated", title: "Unrelated" });
    controller.clearSelection();

    controller.openWorkspaceAgent();

    const view = controller.getState().workspaceAgent;
    expect(view.context.cardCount).toBe(0);
    expect(view.context.focusCardTitle).toBeNull();
  });
});

/**
 * Per-item selection, driven end-to-end through the controller: what the user unchecks
 * must never reach a real interactor, and the completion message must describe what was
 * actually done rather than what was originally proposed.
 */
describe("GriotController — Workspace Agent per-item selection", () => {
  it("projects every proposed item as checked, with card titles resolved", async () => {
    const { controller, agentGateway } = await buildController();
    const a = await controller.createNote({ content: "body a", title: "Note A" });
    const b = await controller.createNote({ content: "body b", title: "Note B" });

    const id = await proposeAndGetId(controller, agentGateway, {
      type: "create_group",
      name: "Cluster",
      cardIds: [a.id, b.id],
    });

    const proposal = controller.getState().workspaceAgent.proposals.find((p) => p.id === id)!;
    expect(proposal.items.map((i) => i.title)).toEqual(["Note A", "Note B"]);
    expect(proposal.items.every((i) => i.selected)).toBe(true);
    expect(proposal.canConfirm).toBe(true);
  });

  it("toggling an item changes nothing in the workspace — no group, no cards, no gateway call", async () => {
    const { controller, cardRepo, agentGateway, extractionGateway, searchGateway } =
      await buildController();
    const workspaceId = controller.getState().activeWorkspaceId!;
    const a = await controller.createNote({ content: "body a", title: "Note A" });
    const b = await controller.createNote({ content: "body b", title: "Note B" });
    const before = (await cardRepo.getCardsByWorkspace(workspaceId)).length;

    const id = await proposeAndGetId(controller, agentGateway, {
      type: "create_group",
      name: "Cluster",
      cardIds: [a.id, b.id],
    });
    controller.toggleWorkspaceAgentProposalItem(id, b.id);

    expect((await cardRepo.getCardsByWorkspace(workspaceId)).length).toBe(before);
    expect(extractionGateway.calls).toEqual([]);
    expect(searchGateway.calls).toEqual([]);
    const proposal = controller.getState().workspaceAgent.proposals.find((p) => p.id === id)!;
    expect(proposal.status).toBe("proposed");
    expect(proposal.items.map((i) => i.selected)).toEqual([true, false]);
  });

  it("confirming a pruned create_cards creates only the kept cards and says so truthfully", async () => {
    const { controller, agentGateway } = await buildController();

    const id = await proposeAndGetId(controller, agentGateway, {
      type: "create_cards",
      cards: [
        { type: "note", title: "Keep A", body: "a" },
        { type: "note", title: "Drop B", body: "b" },
        { type: "note", title: "Keep C", body: "c" },
      ],
    });
    controller.toggleWorkspaceAgentProposalItem(id, "card-1");
    await controller.confirmWorkspaceAgentAction(id);

    const state = controller.getState();
    expect(state.cards.some((c) => c.title === "Keep A")).toBe(true);
    expect(state.cards.some((c) => c.title === "Keep C")).toBe(true);
    expect(state.cards.some((c) => c.title === "Drop B")).toBe(false);
    expect(state.workspaceAgent.proposals.find((p) => p.id === id)!.resultMessage).toBe(
      "Created 2 cards.",
    );
  });

  it("confirming a pruned create_group groups only the kept notes", async () => {
    const { controller, agentGateway } = await buildController();
    const a = await controller.createNote({ content: "body a", title: "Note A" });
    const b = await controller.createNote({ content: "body b", title: "Note B" });

    const id = await proposeAndGetId(controller, agentGateway, {
      type: "create_group",
      name: "Cluster",
      cardIds: [a.id, b.id],
    });
    controller.toggleWorkspaceAgentProposalItem(id, b.id);
    await controller.confirmWorkspaceAgentAction(id);

    const state = controller.getState();
    const group = state.cards.find((c) => c.type === "group" && c.title === "Cluster")!;
    expect(state.cards.find((c) => c.id === a.id)!.parentId).toBe(group.id);
    // The unchecked note was never touched.
    expect(state.cards.find((c) => c.id === b.id)!.parentId).toBeFalsy();
    expect(state.workspaceAgent.proposals.find((p) => p.id === id)!.resultMessage).toContain(
      "1 note",
    );
  });

  it("dropping a query means only the kept queries reach the search preflight", async () => {
    const { controller, agentGateway } = await buildController();

    const id = await proposeAndGetId(controller, agentGateway, {
      type: "search_web",
      queries: ["good query", "bad query"],
      purpose: "find sources",
    });
    controller.toggleWorkspaceAgentProposalItem(id, "query-1");
    await controller.confirmWorkspaceAgentAction(id);

    const state = controller.getState();
    expect(state.aiQuerySuggestions).toEqual(["good query"]);
    // Still nothing actually searched — the preflight is only opened.
    expect(state.workspaceAgent.proposals.find((p) => p.id === id)!.status).toBe("done");
  });

  it("unchecking everything disables confirm and dispatches nothing", async () => {
    const { controller, agentGateway } = await buildController();
    const workspaceId = controller.getState().activeWorkspaceId!;
    const a = await controller.createNote({ content: "body a", title: "Note A" });

    const id = await proposeAndGetId(controller, agentGateway, {
      type: "create_group",
      name: "Cluster",
      cardIds: [a.id],
    });
    controller.toggleWorkspaceAgentProposalItem(id, a.id);

    expect(controller.getState().workspaceAgent.proposals.find((p) => p.id === id)!.canConfirm).toBe(
      false,
    );

    await controller.confirmWorkspaceAgentAction(id);

    const state = controller.getState();
    expect(state.cards.some((c) => c.type === "group")).toBe(false);
    expect(state.workspaceAgent.proposals.find((p) => p.id === id)!.status).toBe("proposed");
    void workspaceId;
  });
});

describe("GriotController — Workspace Agent plain conversation", () => {
  it("a turn with no proposals is shown as ordinary conversation, with nothing to confirm", async () => {
    const { controller, agentGateway } = await buildController();
    controller.openWorkspaceAgent();
    agentGateway.nextTurnRaw = { message: "Your notes circle one question.", proposedActions: [] };

    controller.sendWorkspaceAgentMessage("what do you make of these?");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const view = controller.getState().workspaceAgent;
    expect(view.agentError).toBeNull();
    expect(view.proposals).toEqual([]);
    expect(view.messages.at(-1)).toMatchObject({
      speaker: "assistant",
      text: "Your notes circle one question.",
    });
  });

  it("a turn with the proposedActions key absent is equally valid", async () => {
    const { controller, agentGateway } = await buildController();
    controller.openWorkspaceAgent();
    agentGateway.nextTurnRaw = { message: "Yes — for two reasons." };

    controller.sendWorkspaceAgentMessage("is this a good idea?");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const view = controller.getState().workspaceAgent;
    expect(view.agentError).toBeNull();
    expect(view.proposals).toEqual([]);
    expect(view.messages.at(-1)!.text).toBe("Yes — for two reasons.");
  });
});

/**
 * Mission planning used to be its own sheet (the Goal Architect). It is now a proposal the
 * one agent makes mid-conversation, dispatched through the surviving
 * `CreateMissionPlanInteractor` — so these cover the invariants that feature guaranteed:
 * nothing exists until confirm, the agent's contribution is visibly the agent's, and the
 * completion message counts what actually ran.
 */
describe("GriotController — Workspace Agent create_mission dispatch", () => {
  const plan = (cardIds?: string[]) => ({
    type: "create_mission" as const,
    title: "Ship a synth",
    goalStatement: "Build and ship a playable synth",
    targetDeliverable: "A demo anyone can play",
    successCriteria: ["It makes sound"],
    steps: [
      { title: "Get audio out of a speaker", detail: "Any tone at all" },
      { title: "Add a keyboard" },
      { title: "Package a demo" },
    ],
    ...(cardIds ? { cardIds } : {}),
  });

  it("creates nothing from the proposal alone", async () => {
    const { controller, cardRepo, agentGateway } = await buildController();
    const workspaceId = controller.getState().activeWorkspaceId!;

    await proposeAndGetId(controller, agentGateway, plan());

    expect(await cardRepo.getCardsByWorkspace(workspaceId)).toHaveLength(0);
    const workspace = controller
      .getState()
      .workspaces.find((w) => w.id === workspaceId);
    expect(workspace?.mission).toBeUndefined();
  });

  it("creates the mission through the real interactor and reports what it made", async () => {
    const { controller, agentGateway } = await buildController();
    const note = await controller.createNote({ content: "synth notes", title: "Synth" });

    const id = await proposeAndGetId(controller, agentGateway, plan([note.id]));
    await controller.confirmWorkspaceAgentAction(id);

    const state = controller.getState();
    const proposal = state.workspaceAgent.proposals.find((p) => p.id === id)!;
    expect(proposal.status).toBe("done");
    expect(proposal.resultMessage).toBe('Created mission "Ship a synth" with 3 steps.');

    // The mission group, its three steps, and the two standing notes the interactor adds.
    const group = state.cards.find((c) => c.type === "group" && c.title === "Ship a synth")!;
    expect(group).toBeTruthy();
    expect(state.cards.some((c) => c.title === "Get audio out of a speaker")).toBe(true);
    expect(state.cards.some((c) => c.title === "Known gaps")).toBe(true);

    // The workspace mission itself is set, not just a pile of cards.
    const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
    expect(workspace?.mission?.goalTitle).toBe("Ship a synth");
    expect(workspace?.mission?.missionGroupId).toBe(group.id);

    // Registered as a real, undoable run like every other dispatch.
    expect(state.undoableOperationId).not.toBeNull();
  });

  it("marks the agent's own steps as the agent's work, and never enrols them for review", async () => {
    const { controller, agentGateway } = await buildController();

    const id = await proposeAndGetId(controller, agentGateway, plan());
    await controller.confirmWorkspaceAgentAction(id);

    const state = controller.getState();
    const step = state.cards.find((c) => c.title === "Add a keyboard")!;
    expect(step.provenance?.mode).toBe("agent");
    expect(step.provenance?.model).toBe("test/model");
    // A fresh plan must never arrive as a pile of cards already due.
    expect(state.cards.every((c) => c.schedule === undefined)).toBe(true);
  });

  it("drops the steps the user unchecked, and says so truthfully", async () => {
    const { controller, agentGateway } = await buildController();

    const id = await proposeAndGetId(controller, agentGateway, plan());
    controller.toggleWorkspaceAgentProposalItem(id, "step-1");
    await controller.confirmWorkspaceAgentAction(id);

    const state = controller.getState();
    expect(state.cards.some((c) => c.title === "Add a keyboard")).toBe(false);
    expect(state.cards.some((c) => c.title === "Package a demo")).toBe(true);
    expect(state.workspaceAgent.proposals.find((p) => p.id === id)!.resultMessage).toBe(
      'Created mission "Ship a synth" with 2 steps.',
    );
  });

  it("undoes an agent-created mission, removing exactly the cards it created", async () => {
    const { controller, agentGateway } = await buildController();

    const id = await proposeAndGetId(controller, agentGateway, plan());
    await controller.confirmWorkspaceAgentAction(id);
    expect(controller.getState().cards.length).toBeGreaterThan(0);

    const undone = await controller.undoLastOperation();

    expect(undone).toBe(true);
    expect(controller.getState().cards).toHaveLength(0);
  });
});

/**
 * The assistant used to be reachable only from a Pulse observation, Settings, or a
 * "define mission" button — so on an ordinary screen there was often no way in at all.
 * The shell now carries a persistent Ask affordance; these cover the controller entry
 * point behind it, which is the part that has to work from any primary screen.
 */
describe("GriotController — reaching the workspace agent from anywhere", () => {
  it("opens the conversation scoped to the current screen, with no model call", async () => {
    const { controller, agentGateway } = await buildController();
    // A first launch opens the sheet by itself; close it so this covers the deliberate,
    // from-any-screen entry point rather than that one-off.
    controller.closeWorkspaceAgent();
    expect(controller.getState().workspaceAgent.isOpen).toBe(false);

    controller.openWorkspaceAgent();

    const view = controller.getState().workspaceAgent;
    expect(view.isOpen).toBe(true);
    expect(view.isEmpty).toBe(true);
    // Opening the sheet is not asking anything: nothing leaves the device until a send.
    expect(agentGateway.turnCalls).toBe(0);
  });

  it("opens with nothing selected, no card open and no group — the bare home screen case", async () => {
    const { controller } = await buildController();
    expect(controller.getState().currentGroupId).toBeNull();
    expect(controller.getState().selection.size).toBe(0);

    controller.openWorkspaceAgent();

    const view = controller.getState().workspaceAgent;
    expect(view.isOpen).toBe(true);
    expect(view.context.cardCount).toBe(0);
    expect(view.agentError).toBeNull();
  });

  it("opens while a card is open, carrying that card as the focus context", async () => {
    const { controller } = await buildController();
    const note = await controller.createNote({ content: "body", title: "Note" });
    controller.openCard(note.id);

    controller.openWorkspaceAgent();

    const view = controller.getState().workspaceAgent;
    expect(view.isOpen).toBe(true);
    expect(view.context.cardCount).toBe(1);
  });

  it("closing forgets the session, and it can be reopened", async () => {
    const { controller } = await buildController();
    controller.openWorkspaceAgent();
    controller.closeWorkspaceAgent();
    expect(controller.getState().workspaceAgent.isOpen).toBe(false);

    controller.openWorkspaceAgent();
    expect(controller.getState().workspaceAgent.isOpen).toBe(true);
  });
});

/**
 * Inline action links are a presentation change only. The chip that now appears inside a
 * reply must expand the same inspectable proposal — it must never become a shortcut past
 * confirmation, which is the invariant everything else here rests on.
 */
describe("GriotController — inline action links keep confirm-before-execute", () => {
  it("a proposal is attached to the reply that produced it and still fully inspectable", async () => {
    const { controller, agentGateway } = await buildController();
    const note = await controller.createNote({ content: "note body", title: "Note" });

    await proposeAndGetId(controller, agentGateway, {
      type: "create_group",
      name: "New group",
      cardIds: [note.id],
    });

    const view = controller.getState().workspaceAgent;
    const reply = view.messages.at(-1)!;
    expect(reply.speaker).toBe("assistant");
    expect(reply.proposals.map((p) => p.id)).toEqual(["p1"]);
    // Inline, not detached — and the checkboxes and confirm state travel with it.
    expect(view.detachedProposals).toEqual([]);
    expect(reply.proposals[0].items.length).toBeGreaterThan(0);
    expect(reply.proposals[0].canConfirm).toBe(true);
    expect(reply.proposals[0].status).toBe("proposed");
  });

  it("nothing is created until confirm — reading or expanding the link changes nothing", async () => {
    const { controller, cardRepo, agentGateway } = await buildController();
    const workspaceId = controller.getState().activeWorkspaceId!;
    const note = await controller.createNote({ content: "note body", title: "Note" });

    const id = await proposeAndGetId(controller, agentGateway, {
      type: "create_group",
      name: "New group",
      cardIds: [note.id],
    });

    // Everything the inline link's own press does is local expand state; the only
    // controller calls reachable from the expanded card short of CONFIRM are toggles.
    controller.toggleWorkspaceAgentProposalItem(id, note.id);
    controller.toggleWorkspaceAgentProposalItem(id, note.id);

    expect((await cardRepo.getCardsByWorkspace(workspaceId)).some((c) => c.type === "group")).toBe(
      false,
    );

    await controller.confirmWorkspaceAgentAction(id);

    expect((await cardRepo.getCardsByWorkspace(workspaceId)).some((c) => c.type === "group")).toBe(
      true,
    );
  });

  it("a reply with no proposals carries no inline action chrome at all", async () => {
    const { controller, agentGateway } = await buildController();
    controller.openWorkspaceAgent();
    agentGateway.nextTurnRaw = { message: "Just conversation.", proposedActions: [] };

    controller.sendWorkspaceAgentMessage("hi");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const view = controller.getState().workspaceAgent;
    expect(view.messages.at(-1)!.proposals).toEqual([]);
    expect(view.proposals).toEqual([]);
    expect(view.detachedProposals).toEqual([]);
  });

  it("surfaces the exact context that was sent, and no reasoning the model didn't give", async () => {
    const { controller, agentGateway } = await buildController();
    const note = await controller.createNote({ content: "note body", title: "Note" });
    controller.toggleSelect(note.id);

    controller.openWorkspaceAgent();
    agentGateway.nextTurnRaw = { message: "Answer.", proposedActions: [] };
    controller.sendWorkspaceAgentMessage("explain this");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const reply = controller.getState().workspaceAgent.messages.at(-1)!;
    const sent = reply.sentContext!;
    const briefing = agentGateway.briefings.at(-1)!;

    expect(sent.cards.map((c) => c.id)).toContain(note.id);
    for (const card of sent.cards) expect(briefing).toContain(`[${card.id}]`);
    expect(sent.briefing).toBe(briefing);
    // This stub returns no reasoning, so nothing may claim any.
    expect(reply.reasoning).toBeUndefined();
  });
});
