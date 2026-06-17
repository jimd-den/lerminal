import { describe, expect, it } from "bun:test";
import { createCard } from "../../entities/card";
import { createInitialSchedule } from "../../entities/schedule";
import { MemoryCardRepository } from "../../adapters/repositories/MemoryCardRepository";
import { MemoryWorkspaceRepository } from "../../adapters/repositories/MemoryWorkspaceRepository";
import { MemorySettingsRepository } from "../../adapters/repositories/MemorySettingsRepository";
import { AgentCardResponse, AgentGateway, AgentModel } from "../../adapters/gateways/AgentGateway";
import { Card } from "../../entities/card";
import { NothingDueError } from "../errors";
import { StartReviewInteractor } from "../review/StartReviewInteractor";
import { GradeReviewInteractor } from "../review/GradeReviewInteractor";
import { CreateWorkspaceInteractor } from "../workspace/CreateWorkspaceInteractor";
import { SwitchWorkspaceInteractor } from "../workspace/SwitchWorkspaceInteractor";
import { DeleteWorkspaceInteractor } from "../workspace/DeleteWorkspaceInteractor";
import { RestartOnboardingInteractor } from "../onboarding/RestartOnboardingInteractor";
import { CompleteOnboardingInteractor } from "../onboarding/CompleteOnboardingInteractor";

class MockAgentGateway implements AgentGateway {
  async ask(query: string): Promise<AgentCardResponse[]> {
    return [{ title: "Seed", body: `for ${query}` }];
  }
  async fetchModels(): Promise<AgentModel[]> {
    return [];
  }
}

const SETTINGS = {
  theme: "dark" as const,
  accent: "teal" as const,
  openRouterKey: "key",
  selectedModel: "model",
  customSystemPrompt: "prompt",
};

describe("StartReviewInteractor", () => {
  const now = 1_000_000;
  const interactor = new StartReviewInteractor();

  it("returns due question cards", () => {
    const due = createCard({ workspaceId: "w", type: "question", title: "Q", body: "" });
    due.schedule = { dueAt: now - 1, interval: 1, reps: 0 };
    const future = createCard({ workspaceId: "w", type: "question", title: "Q2", body: "" });
    future.schedule = { dueAt: now + 10_000, interval: 1, reps: 0 };

    const queue = interactor.execute([due, future], now);
    expect(queue.map(c => c.id)).toEqual([due.id]);
  });

  it("falls back to all scheduled when nothing is due", () => {
    const future = createCard({ workspaceId: "w", type: "question", title: "Q", body: "" });
    future.schedule = { dueAt: now + 10_000, interval: 1, reps: 0 };
    expect(interactor.execute([future], now).length).toBe(1);
  });

  it("throws NothingDueError with no scheduled cards", () => {
    expect(() => interactor.execute([], now)).toThrow(NothingDueError);
  });
});

describe("GradeReviewInteractor", () => {
  it("advances and persists the schedule on pass", async () => {
    const repo = new MemoryCardRepository();
    const card: Card = createCard({ workspaceId: "w", type: "question", title: "Q", body: "" });
    card.schedule = createInitialSchedule(0);
    const interactor = new GradeReviewInteractor(repo);

    const updated = await interactor.execute(card, true, 0);
    expect(updated?.schedule?.reps).toBe(1);
    expect((await repo.getCard(card.id))?.schedule?.reps).toBe(1);
  });

  it("returns null when card has no schedule", async () => {
    const repo = new MemoryCardRepository();
    const card = createCard({ workspaceId: "w", type: "question", title: "Q", body: "" });
    expect(await new GradeReviewInteractor(repo).execute(card, true, 0)).toBeNull();
  });
});

describe("Workspace interactors", () => {
  it("creates and persists a workspace", async () => {
    const repo = new MemoryWorkspaceRepository();
    const ws = await new CreateWorkspaceInteractor(repo).execute("My Topic");
    expect((await repo.getWorkspaces()).map(w => w.id)).toContain(ws.id);
  });

  it("switch loads only the target workspace cards", async () => {
    const repo = new MemoryCardRepository();
    await repo.saveCard(createCard({ workspaceId: "a", type: "note", title: "A", body: "x" }));
    await repo.saveCard(createCard({ workspaceId: "b", type: "note", title: "B", body: "y" }));
    const cards = await new SwitchWorkspaceInteractor(repo).execute("a");
    expect(cards.length).toBe(1);
    expect(cards[0].workspaceId).toBe("a");
  });

  it("delete removes the workspace and its cards", async () => {
    const wsRepo = new MemoryWorkspaceRepository();
    const cardRepo = new MemoryCardRepository();
    await wsRepo.saveWorkspace({ id: "a", name: "A", createdAt: 0 });
    await cardRepo.saveCard(createCard({ id: "c1", workspaceId: "a", type: "note", title: "A", body: "x" }));

    await new DeleteWorkspaceInteractor(wsRepo, cardRepo).execute("a");

    expect((await wsRepo.getWorkspaces()).length).toBe(0);
    expect((await cardRepo.getCardsByWorkspace("a")).length).toBe(0);
  });
});

describe("RestartOnboardingInteractor", () => {
  it("wipes all workspaces and cards", async () => {
    const wsRepo = new MemoryWorkspaceRepository();
    const cardRepo = new MemoryCardRepository();
    await wsRepo.saveWorkspace({ id: "a", name: "A", createdAt: 0 });
    await cardRepo.saveCard(createCard({ workspaceId: "a", type: "note", title: "A", body: "x" }));

    await new RestartOnboardingInteractor(wsRepo, cardRepo).execute();

    expect((await wsRepo.getWorkspaces()).length).toBe(0);
    expect((await cardRepo.getCardsByWorkspace("a")).length).toBe(0);
  });
});

describe("CompleteOnboardingInteractor", () => {
  it("creates a workspace, persists settings, and seeds cards", async () => {
    const wsRepo = new MemoryWorkspaceRepository();
    const cardRepo = new MemoryCardRepository();
    const settingsRepo = new MemorySettingsRepository();
    const interactor = new CompleteOnboardingInteractor(
      wsRepo,
      cardRepo,
      settingsRepo,
      new MockAgentGateway()
    );

    const { workspace, cards } = await interactor.execute({
      topic: "Machine Learning",
      prompt: "Linear algebra",
      settings: SETTINGS,
    });

    expect(workspace.name).toBe("Machine Learning");
    expect(cards.length).toBe(1);
    expect((await cardRepo.getCardsByWorkspace(workspace.id)).length).toBe(1);
    expect((await settingsRepo.getSettings())?.openRouterKey).toBe("key");
  });
});
