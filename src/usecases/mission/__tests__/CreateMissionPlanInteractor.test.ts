import { beforeEach, describe, expect, it } from "bun:test";
import {
  CreateMissionPlanInteractor,
  MissionPlanError,
} from "../CreateMissionPlanInteractor";
import { UndoOperationInteractor } from "../../undo/UndoOperationInteractor";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { MemoryWorkspaceRepository } from "../../../adapters/repositories/MemoryWorkspaceRepository";
import { MemoryOperationLogRepository } from "../../../adapters/repositories/MemoryOperationLogRepository";
import { createWorkspace } from "../../../entities/workspace";
import {
  buildMissionProposal,
  EMPTY_WORKING_MAP,
  insight,
  mergeIntoWorkingMap,
  WorkingMap,
} from "../../../entities/mission";

/**
 * The question-and-answer flow that used to produce a working map is gone — goal planning
 * is now a Workspace Agent tool intent. The map is built directly here, which is exactly
 * how the surviving callers build one.
 */
const workingMap = (): WorkingMap =>
  mergeIntoWorkingMap(EMPTY_WORKING_MAP, {
    goal: insight("Build a playable puzzle game", "user"),
    deliverable: insight("A demo with ten levels", "user"),
    candidateNextActions: [insight("One level that plays start to finish", "user")],
    prerequisites: [insight("Level generation", "user")],
    unknowns: [insight("How hard level generation is", "app")],
  });

const ANSWER_IDS = ["outcome", "finished-result", "smallest-proof", "blocker"];

let cardRepo: MemoryCardRepository;
let workspaceRepo: MemoryWorkspaceRepository;
let operationLogRepo: MemoryOperationLogRepository;
let interactor: CreateMissionPlanInteractor;

const WORKSPACE_ID = "ws-1";

beforeEach(async () => {
  cardRepo = new MemoryCardRepository();
  workspaceRepo = new MemoryWorkspaceRepository();
  operationLogRepo = new MemoryOperationLogRepository();
  await workspaceRepo.saveWorkspace(
    createWorkspace({ id: WORKSPACE_ID, name: "Games" })
  );
  interactor = new CreateMissionPlanInteractor(cardRepo, workspaceRepo, operationLogRepo);
});

const run = (overrides: Partial<Parameters<typeof interactor.execute>[0]> = {}) => {
  const map = workingMap();
  return interactor.execute({
    workspaceId: WORKSPACE_ID,
    proposal: buildMissionProposal(map),
    map,
    answerIds: ANSWER_IDS,
    modelUsed: false,
    webUsed: false,
    startedAt: 500,
    ...overrides,
  });
};

describe("CreateMissionPlanInteractor", () => {
  it("creates the mission cards with the semantic roles the app understands", async () => {
    const { cards } = await run();

    const roles = new Set(cards.map(card => card.role));
    expect(roles.has("goal")).toBe(true);
    expect(roles.has("deliverable")).toBe(true);
    expect(roles.has("task")).toBe(true);
    expect(roles.has("experiment")).toBe(true);
  });

  it("nests every card under the mission group", async () => {
    const { group, cards } = await run();

    const children = cards.filter(card => card.id !== group.id);
    expect(children.every(card => card.parentId === group.id)).toBe(true);
  });

  it("always carries a Mission assumptions and a Known gaps note", async () => {
    const { cards } = await run();

    const titles = cards.map(card => card.title);
    expect(titles).toContain("Mission assumptions");
    expect(titles).toContain("Known gaps");
  });

  it("persists the cards rather than only returning them", async () => {
    const { cards } = await run();

    expect(await cardRepo.getCardsByWorkspace(WORKSPACE_ID)).toHaveLength(cards.length);
  });

  it("sets the workspace mission from the proposal", async () => {
    await run();

    const [workspace] = await workspaceRepo.getWorkspaces();
    expect(workspace.mission?.goalTitle).toBe("Build a playable puzzle game");
    expect(workspace.mission?.targetDeliverable).toBe("A demo with ten levels");
  });

  it("never enrols anything in spaced repetition", async () => {
    const { cards } = await run();

    // A fresh plan must not arrive as a pile of cards already due.
    expect(cards.every(card => card.schedule === undefined)).toBe(true);
  });

  it("gives every card provenance", async () => {
    const { cards } = await run();

    expect(cards.every(card => card.provenance !== undefined)).toBe(true);
    expect(cards.every(card => card.provenance!.operationId !== undefined)).toBe(true);
  });

  it("records no model on a mission built without one", async () => {
    const { cards, operation } = await run({ modelUsed: false, model: "some/model" });

    // The model id was supplied but never used; a receipt naming it would be a lie.
    expect(operation.model).toBeUndefined();
    expect(cards.every(card => card.provenance?.model === undefined)).toBe(true);
    expect(operation.summary).toContain("without a model");
  });

  it("records the model when one genuinely contributed", async () => {
    const { operation } = await run({ modelUsed: true, model: "openai/gpt-4" });

    expect(operation.model).toBe("openai/gpt-4");
    expect(operation.summary).toContain("openai/gpt-4");
  });

  it("reports no web access when nothing was searched", async () => {
    const { operation } = await run();

    expect(operation.webUsed).toBe(false);
    expect(operation.summary).toContain("without web access");
  });

  it("records the query actually executed when a search really ran", async () => {
    const { operation } = await run({
      webUsed: true,
      searchQueries: ["tilemap collision"],
    });

    expect(operation.webUsed).toBe(true);
    expect(operation.searchQuery).toBe("tilemap collision");
  });

  it("attributes a user-derived card to the user, not the agent", async () => {
    const { cards } = await run({ modelUsed: true, model: "m" });

    const goal = cards.find(card => card.role === "goal" && card.type !== "group");
    expect(goal?.provenance?.mode).toBe("manual");
  });

  it("attributes an agent-suggested card to the agent", async () => {
    const map = mergeIntoWorkingMap(workingMap(), {
      prerequisites: [insight("Spatial partitioning", "agent")],
    });

    const { cards } = await interactor.execute({
      workspaceId: WORKSPACE_ID,
      proposal: buildMissionProposal(map),
      map,
      answerIds: [],
      modelUsed: true,
      model: "m",
      webUsed: false,
      startedAt: 0,
    });

    const suggested = cards.find(card => card.title.includes("Spatial partitioning"));
    expect(suggested?.provenance?.mode).toBe("agent");
  });

  it("writes a receipt naming the answers in and the cards out", async () => {
    const { operation, cards } = await run();

    expect(operation.commandName).toBe("goal");
    expect(operation.inputCardIds).toEqual(ANSWER_IDS);
    expect(operation.createdCardIds.sort()).toEqual(cards.map(c => c.id).sort());
    expect(await operationLogRepo.getRecord(operation.id)).toBeTruthy();
  });

  it("refuses a proposal with no goal statement instead of creating an empty mission", async () => {
    const map = EMPTY_WORKING_MAP;
    const error = await interactor
      .execute({
        workspaceId: WORKSPACE_ID,
        proposal: buildMissionProposal(map),
        map,
        answerIds: [],
        modelUsed: false,
        webUsed: false,
        startedAt: 0,
      })
      .catch(e => e);

    expect(error).toBeInstanceOf(MissionPlanError);
    expect(await cardRepo.getCardsByWorkspace(WORKSPACE_ID)).toHaveLength(0);
  });

  it("refuses when the workspace has gone", async () => {
    const map = workingMap();
    const error = await interactor
      .execute({
        workspaceId: "missing",
        proposal: buildMissionProposal(map),
        map,
        answerIds: [],
        modelUsed: false,
        webUsed: false,
        startedAt: 0,
      })
      .catch(e => e);

    expect(error).toBeInstanceOf(MissionPlanError);
  });
});

describe("undoing an accepted mission", () => {
  it("removes the cards it created when none have been touched", async () => {
    const { operation, cards } = await run();
    const undo = new UndoOperationInteractor(cardRepo, operationLogRepo);

    await undo.execute(operation, cards);

    expect(await cardRepo.getCardsByWorkspace(WORKSPACE_ID)).toHaveLength(0);
  });

  it("refuses rather than discarding an edit made after creation", async () => {
    const { operation, cards } = await run();
    const undo = new UndoOperationInteractor(cardRepo, operationLogRepo);

    // The user rewrote a mission card; undo must not silently throw that away.
    const edited = cards.map((card, index) =>
      index === 1 ? { ...card, body: "My own rewrite" } : card
    );
    const result = await undo.execute(operation, edited).catch(e => e);

    expect(result).toBeInstanceOf(Error);
    expect(await cardRepo.getCardsByWorkspace(WORKSPACE_ID)).toHaveLength(cards.length);
  });
});
