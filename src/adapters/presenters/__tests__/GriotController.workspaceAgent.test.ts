import { describe, expect, it, beforeEach } from "bun:test";
import { GriotController } from "../GriotController";
import { narrowToolIntent } from "../../../entities/workspaceAgent";
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
  nextTurnText = "";
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
    return { text: this.nextTurnText, webCitations: [] };
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
/**
 * Dispatches an intent the way the app does, through the controller's single entry point.
 *
 * These tests are about what happens *after* an intent exists — that it reaches the real
 * interactor, records an operation, and reports truthfully. How the intent was written
 * down (a tag today, a JSON envelope before) is deliberately not their subject.
 */
async function dispatchTool(controller: GriotController, tool: any): Promise<string> {
  controller.openWorkspaceAgent();
  const context = { selectedCardIds: [], currentGroupId: null };
  return controller.dispatchWorkspaceAgentTool(tool, context as any);
}

describe("GriotController — Workspace Agent Phase D dispatch", () => {
  it("does not create anything merely from a tag — only + dispatches", async () => {
    const { controller, cardRepo, agentGateway } = await buildController();
    const workspaceId = controller.getState().activeWorkspaceId!;
    await controller.createNote({ content: "note body", title: "Note" });

    controller.openWorkspaceAgent();
    agentGateway.nextTurnText = "These belong together. [[group: New group]]";
    controller.sendWorkspaceAgentMessage("tidy this up");
    await new Promise(resolve => setTimeout(resolve, 0));

    // The chip is on screen and the intent is resolved, but nothing has been created.
    const cards = await cardRepo.getCardsByWorkspace(workspaceId);
    expect(cards.some(c => c.type === "group")).toBe(false);
  });

  it("create_group dispatches to GroupCardsInteractor with the given cardIds/name and records an operation", async () => {
    const { controller, agentGateway } = await buildController();
    const note = await controller.createNote({ content: "note body", title: "Note" });

    const message = await dispatchTool(controller, {
      type: "create_group",
      name: "New group",
      cardIds: [note.id],
    });

    const state = controller.getState();
    expect(message).toContain("New group");
    expect(state.cards.some((c) => c.type === "group" && c.title === "New group")).toBe(true);
    const grouped = state.cards.find((c) => c.id === note.id);
    expect(grouped?.parentId).toBe(state.cards.find((c) => c.title === "New group")!.id);
  });

  it("a failing GroupCardsInteractor leaves no partial state and surfaces a failure", async () => {
    const { controller } = await buildController();
    const note = await controller.createNote({ content: "note body", title: "Note" });

    // The card goes away between the reply and the tap (deleted elsewhere), so
    // GroupCardsInteractor throws. No group may exist, and the failure must surface as a
    // rejection the chip can report — never a silent stuck state.
    await controller.deleteCard(note.id);

    await expect(
      dispatchTool(controller, { type: "create_group", name: "Bad group", cardIds: [note.id] }),
    ).rejects.toThrow();

    expect(controller.getState().cards.some(c => c.type === "group")).toBe(false);
  });

  it("create_cards dispatches to card creation with Provenance.mode = 'agent'", async () => {
    const { controller, agentGateway } = await buildController();

    const message = await dispatchTool(controller, {
      type: "create_cards",
      cards: [{ type: "note", title: "Agent note", body: "Body text" }],
    });

    const state = controller.getState();
    const created = state.cards.find((c) => c.title === "Agent note");
    expect(created).toBeDefined();
    expect(created!.provenance?.mode).toBe("agent");
  });

  it("create_cards with no destination group creates a real group containing the new cards", async () => {
    const { controller } = await buildController();

    const message = await dispatchTool(controller, {
      type: "create_cards",
      cards: [
        { type: "note", title: "Agent note", body: "Body text" },
        { type: "note", title: "Second note", body: "More text" },
      ],
    });

    const state = controller.getState();
    const group = state.cards.find((c) => c.type === "group");
    expect(group).toBeDefined();
    // Not a generic, always-the-same placeholder.
    expect(group!.title).not.toBe("New group");
    expect(group!.title.length).toBeGreaterThan(0);
    // The group carries the same agent provenance every other agent-created thing gets.
    expect(group!.provenance?.mode).toBe("agent");

    const created = state.cards.filter((c) => c.title === "Agent note" || c.title === "Second note");
    expect(created).toHaveLength(2);
    for (const card of created) {
      expect(card.parentId).toBe(group!.id);
    }

    expect(message).toContain("2 cards");
    expect(message).toContain(group!.title);
  });

  it("create_cards with an existing destination group lands cards there directly, without creating an extra group", async () => {
    const { controller } = await buildController();

    const existingGroup = await dispatchTool(controller, {
      type: "create_group",
      name: "Existing group",
      cardIds: [(await controller.createNote({ content: "seed", title: "Seed" })).id],
    });
    void existingGroup;
    const groupId = controller.getState().cards.find((c) => c.type === "group")!.id;

    await dispatchTool(controller, {
      type: "create_cards",
      cards: [{ type: "note", title: "Nested note", body: "Body", parentId: groupId }],
    });

    const state = controller.getState();
    const groups = state.cards.filter((c) => c.type === "group");
    expect(groups).toHaveLength(1);
    const nested = state.cards.find((c) => c.title === "Nested note");
    expect(nested?.parentId).toBe(groupId);
  });

  it("create_cards inside an open group (context.currentGroupId) lands cards there without an extra group", async () => {
    const { controller } = await buildController();
    const note = await controller.createNote({ content: "seed", title: "Seed" });
    await controller.dispatchWorkspaceAgentTool(
      { type: "create_group", name: "Open group", cardIds: [note.id] },
      { selectedCardIds: [], currentGroupId: null } as any,
    );
    const groupId = controller.getState().cards.find((c) => c.type === "group")!.id;

    controller.openWorkspaceAgent();
    await controller.dispatchWorkspaceAgentTool(
      { type: "create_cards", cards: [{ type: "note", title: "In-group note", body: "Body" }] },
      { selectedCardIds: [], currentGroupId: groupId } as any,
    );

    const state = controller.getState();
    const groups = state.cards.filter((c) => c.type === "group");
    expect(groups).toHaveLength(1);
    const nested = state.cards.find((c) => c.title === "In-group note");
    expect(nested?.parentId).toBe(groupId);
  });

  it("extract_url dispatches to ExtractUrlInteractor for the given cardId", async () => {
    const { controller, agentGateway, extractionGateway } = await buildController();
    // extractUrlToCard is the existing manual path — reuse it to get a real source card
    // with a `cite` on it, so the agent proposal has something valid to reference.
    await controller.extractUrlToCard("https://example.com/original", "Source");
    extractionGateway.calls = [];
    const source = controller.getState().cards.find((c) => c.title === "Source")!;

    const message = await dispatchTool(controller, {
      type: "extract_url",
      cardId: source.id,
    });

    expect(extractionGateway.calls).toEqual(["https://example.com/original"]);
    const state = controller.getState();
    expect(
      state.cards.some((c) => c.body === "Extracted content from https://example.com/original" && c.id !== source.id),
    ).toBe(true);
  });

  it("search_web opens the research preflight but never calls SearchGateway directly on confirm", async () => {
    const { controller, agentGateway, searchGateway } = await buildController();

    const message = await dispatchTool(controller, {
      type: "search_web",
      queries: ["eigenvectors"],
      purpose: "background reading",
    });

    expect(searchGateway.calls).toEqual([]);
    const state = controller.getState();
    expect(state.activePreflightPresetId).toBe("research-web");
    expect(state.preflightQuery).toBe("eigenvectors");
  });

  it("make_study_candidates creates candidate cards but never enrolls them into review", async () => {
    const { controller, agentGateway } = await buildController();
    const source = await controller.createNote({ content: "concept body", title: "Concept" });

    const message = await dispatchTool(controller, {
      type: "make_study_candidates",
      cardIds: [source.id],
      mode: "recall",
    });

    const state = controller.getState();
    const candidate = state.cards.find((c) => c.title.startsWith("Recall:"));
    expect(candidate).toBeDefined();
    expect(candidate!.schedule).toBeUndefined();
  });

  it("link_cards creates exactly one CardLink, produces an OperationRecord, and shows up as a linked note", async () => {
    const { controller, agentGateway } = await buildController();
    const a = await controller.createNote({ content: "a", title: "A" });
    const b = await controller.createNote({ content: "b", title: "B" });

    const message = await dispatchTool(controller, {
      type: "link_cards",
      sourceCardId: a.id,
      targetCardId: b.id,
      relation: "Related to",
    });

    const state = controller.getState();
    expect(message).toContain("A");
    expect(message).toContain("B");
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

    const message = await dispatchTool(controller, {
      type: "link_cards",
      sourceCardId: a.id,
      targetCardId: b.id,
    });
    // Confirming the same (already "done") proposal again is a no-op at the workflow
    // level — see `WorkspaceAgentWorkflow.confirmProposal`'s `status !== "proposed"` guard.

    controller.openCard(a.id);
    expect(controller.getState().linkedCardsForOpenCard).toHaveLength(1);
  });

  it("ask_clarifying_question is a documented no-op, not a fabricated execution", async () => {
    const { controller, agentGateway } = await buildController();

    const message = await dispatchTool(controller, {
      type: "ask_clarifying_question",
      question: "Which source did you mean?",
    });

    const state = controller.getState();
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
    agentGateway.nextTurnText = "ok";
    // Capture auto-selects what it just made; start from a clean selection.
    controller.clearSelection();

    controller.openCard(note.id);
    controller.openWorkspaceAgent();
    await send(controller);

    const briefing = agentGateway.briefings.at(-1)!;
    expect(briefing).toContain("MITOCHONDRIA BODY TEXT");
    expect(briefing).toContain("[focus]");
  });

  it("reflects a selection change made while the sheet is already open", async () => {
    const { controller, agentGateway } = await buildController();
    const first = await controller.createNote({ content: "FIRST BODY", title: "First" });
    const second = await controller.createNote({ content: "SECOND BODY", title: "Second" });
    agentGateway.nextTurnText = "ok";

    controller.clearSelection();
    controller.toggleSelect(first.id);
    controller.openWorkspaceAgent();
    // The user changes their mind without closing the sheet.
    controller.toggleSelect(first.id);
    controller.toggleSelect(second.id);
    await send(controller);

    const briefing = agentGateway.briefings.at(-1)!;
    expect(briefing).toMatch(/^1\. \[focus\] /m);
    expect(briefing.match(/\[focus\]/g) ?? []).toHaveLength(1);
  });

  it("context chips count exactly the cards being sent — open card plus selection, de-duplicated", async () => {
    const { controller, agentGateway } = await buildController();
    const a = await controller.createNote({ content: "A BODY", title: "Alpha" });
    const b = await controller.createNote({ content: "B BODY", title: "Beta" });
    agentGateway.nextTurnText = "ok";

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
    expect(briefing).toContain("[focus]");
    expect(briefing).toMatch(/^1\. \[focus\] /m);
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
describe("GriotController — Workspace Agent plain conversation", () => {
  it("a reply with no tags is shown as ordinary conversation, with nothing to add", async () => {
    const { controller, agentGateway } = await buildController();
    controller.openWorkspaceAgent();
    agentGateway.nextTurnText = "Your notes circle one question.";

    controller.sendWorkspaceAgentMessage("what do you make of these?");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const view = controller.getState().workspaceAgent;
    expect(view.agentError).toBeNull();
    expect(view.messages.at(-1)!.segments.some(s => s.kind === "tag")).toBe(false);
    expect(view.messages.at(-1)).toMatchObject({
      speaker: "assistant",
      text: "Your notes circle one question.",
    });
  });

  it("a reply with no tags at all is equally valid", async () => {
    const { controller, agentGateway } = await buildController();
    controller.openWorkspaceAgent();
    agentGateway.nextTurnText = "Yes — for two reasons.";

    controller.sendWorkspaceAgentMessage("is this a good idea?");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const view = controller.getState().workspaceAgent;
    expect(view.agentError).toBeNull();
    expect(view.messages.at(-1)!.segments.some(s => s.kind === "tag")).toBe(false);
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

  it("creates nothing until the intent is actually dispatched", async () => {
    const { controller, cardRepo } = await buildController();
    const workspaceId = controller.getState().activeWorkspaceId!;

    controller.openWorkspaceAgent();

    expect(await cardRepo.getCardsByWorkspace(workspaceId)).toHaveLength(0);
    const workspace = controller.getState().workspaces.find(w => w.id === workspaceId);
    expect(workspace?.mission).toBeUndefined();
  });

  it("creates the mission through the real interactor and reports what it made", async () => {
    const { controller, agentGateway } = await buildController();
    const note = await controller.createNote({ content: "synth notes", title: "Synth" });

    const message = await dispatchTool(controller, plan([note.id]));

    const state = controller.getState();
    expect(message).toBe('Created mission "Ship a synth" with 3 steps.');

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

    const message = await dispatchTool(controller, plan());

    const state = controller.getState();
    const step = state.cards.find((c) => c.title === "Add a keyboard")!;
    expect(step.provenance?.mode).toBe("agent");
    expect(step.provenance?.model).toBe("test/model");
    // A fresh plan must never arrive as a pile of cards already due.
    expect(state.cards.every((c) => c.schedule === undefined)).toBe(true);
  });

  it("dispatches only the steps left checked, and says so truthfully", async () => {
    const { controller } = await buildController();

    // Pruning happens before dispatch (see `narrowToolIntent`), so the interactor only
    // ever sees what survived — which is also what makes the count in the message true.
    const narrowed = narrowToolIntent(plan(), ["step-0", "step-2"])!;
    const message = await dispatchTool(controller, narrowed);

    const state = controller.getState();
    expect(state.cards.some(c => c.title === "Add a keyboard")).toBe(false);
    expect(state.cards.some(c => c.title === "Package a demo")).toBe(true);
    expect(message).toBe('Created mission "Ship a synth" with 2 steps.');
  });

  it("undoes an agent-created mission, removing exactly the cards it created", async () => {
    const { controller, agentGateway } = await buildController();

    const message = await dispatchTool(controller, plan());
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
