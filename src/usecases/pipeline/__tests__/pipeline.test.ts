import { describe, expect, it } from "bun:test";
import { Card, createCard } from "../../../entities/card";
import { Workspace } from "../../../entities/workspace";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { AgentCardResponse, AgentGateway, AgentModel } from "../../../adapters/gateways/AgentGateway";
import {
  EmptySelectionError,
  MissingArgumentError,
  UnknownCommandError,
  WorkspaceNotFoundError,
} from "../../errors";
import { PipelineEnvironment, PipelineRunner } from "../PipelineRunner";
import { AskCommand } from "../AskCommand";
import { SourceCommand } from "../SourceCommand";
import { ChunkCommand } from "../ChunkCommand";
import { RecallCommand } from "../RecallCommand";
import { SpaceCommand } from "../SpaceCommand";
import { MoveCommand } from "../MoveCommand";
import { ReviewCommand } from "../ReviewCommand";

class MockAgentGateway implements AgentGateway {
  async ask(query: string): Promise<AgentCardResponse[]> {
    return [
      { title: "A", body: `Answer for ${query}` },
      { title: "B", body: "More detail" },
    ];
  }
  async fetchModels(): Promise<AgentModel[]> {
    return [];
  }
}

const WS_ID = "ws-1";

function buildRunner(cardRepo: MemoryCardRepository): PipelineRunner {
  const gw = new MockAgentGateway();
  return new PipelineRunner([
    new AskCommand(gw, cardRepo),
    new SourceCommand(cardRepo),
    new ChunkCommand(cardRepo),
    new RecallCommand(cardRepo),
    new SpaceCommand(cardRepo),
    new MoveCommand(cardRepo),
    new ReviewCommand(),
  ]);
}

function env(overrides: Partial<PipelineEnvironment> = {}): PipelineEnvironment {
  return {
    workspaceId: WS_ID,
    initialInputCards: [],
    workspaces: [],
    apiKey: "k",
    model: "m",
    systemPrompt: "p",
    ...overrides,
  };
}

describe("PipelineRunner", () => {
  it("ask produces and persists chunk cards", async () => {
    const repo = new MemoryCardRepository();
    const runner = buildRunner(repo);

    const outcome = await runner.run('ask "react"', env());

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.cards.length).toBe(2);
    expect(outcome.cards[0].type).toBe("chunk");
    expect((await repo.getCardsByWorkspace(WS_ID)).length).toBe(2);
  });

  it("threads ask output into chunk (chaining across stages)", async () => {
    const repo = new MemoryCardRepository();
    const runner = buildRunner(repo);

    // The mock returns 2 cards; chunk re-splits each body. This must operate on the
    // freshly created ask output, not a stale selection.
    const outcome = await runner.run('ask "react" | chunk', env());

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.cards.length).toBeGreaterThan(0);
    expect(outcome.cards.every(c => c.type === "chunk")).toBe(true);
  });

  it("recall converts chunk input into a question card", async () => {
    const repo = new MemoryCardRepository();
    const runner = buildRunner(repo);
    const chunk = createCard({ workspaceId: WS_ID, type: "chunk", title: "T", body: "Body text here." });

    const outcome = await runner.run("recall", env({ initialInputCards: [chunk] }));

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.cards.length).toBe(1);
    expect(outcome.cards[0].type).toBe("question");
  });

  it("space schedules question cards", async () => {
    const repo = new MemoryCardRepository();
    const runner = buildRunner(repo);
    const q = createCard({ workspaceId: WS_ID, type: "question", title: "Q?", body: "", answer: "a" });

    const outcome = await runner.run("space", env({ initialInputCards: [q] }));

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.cards[0].schedule).toBeDefined();
  });

  it("ask with no argument halts for input", async () => {
    const outcome = await buildRunner(new MemoryCardRepository()).run("ask", env());
    expect(outcome).toEqual({ kind: "needsInput", mode: "ask" });
  });

  it("source with no argument halts for input", async () => {
    const outcome = await buildRunner(new MemoryCardRepository()).run("source", env());
    expect(outcome).toEqual({ kind: "needsInput", mode: "source" });
  });

  it("review halts the pipeline", async () => {
    const outcome = await buildRunner(new MemoryCardRepository()).run("review", env());
    expect(outcome).toEqual({ kind: "review" });
  });

  it("move reassigns cards and yields no downstream cards", async () => {
    const repo = new MemoryCardRepository();
    const runner = buildRunner(repo);
    const card = createCard({ workspaceId: WS_ID, type: "chunk", title: "T", body: "b" });
    await repo.saveCard(card);
    const target: Workspace = { id: "ws-2", name: "Other", createdAt: 0 };

    const outcome = await runner.run("move Other", env({ initialInputCards: [card], workspaces: [target] }));

    expect(outcome).toEqual({ kind: "completed", cards: [] });
    expect((await repo.getCardsByWorkspace("ws-2")).length).toBe(1);
  });

  it("chunk with no chunkable input throws EmptySelectionError", async () => {
    const q = createCard({ workspaceId: WS_ID, type: "question", title: "Q?", body: "" });
    await expect(
      buildRunner(new MemoryCardRepository()).run("chunk", env({ initialInputCards: [q] }))
    ).rejects.toBeInstanceOf(EmptySelectionError);
  });

  it("move without target throws MissingArgumentError", async () => {
    await expect(
      buildRunner(new MemoryCardRepository()).run("move", env())
    ).rejects.toBeInstanceOf(MissingArgumentError);
  });

  it("move to unknown workspace throws WorkspaceNotFoundError", async () => {
    const card = createCard({ workspaceId: WS_ID, type: "chunk", title: "T", body: "b" });
    await expect(
      buildRunner(new MemoryCardRepository()).run("move nope", env({ initialInputCards: [card] }))
    ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("unknown command throws UnknownCommandError", async () => {
    await expect(
      buildRunner(new MemoryCardRepository()).run("frobnicate", env())
    ).rejects.toBeInstanceOf(UnknownCommandError);
  });
});
