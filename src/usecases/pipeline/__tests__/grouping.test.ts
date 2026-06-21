import { describe, expect, it } from "bun:test";
import { createCard } from "../../../entities/card";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { AgentCardResponse, AgentGateway, AgentModel } from "../../../adapters/gateways/AgentGateway";
import { GroupCardsInteractor } from "../../grouping/GroupCardsInteractor";
import { PipelineEnvironment, PipelineRunner } from "../PipelineRunner";
import { AskCommand } from "../AskCommand";
import { SourceCommand } from "../SourceCommand";
import { ChunkCommand } from "../ChunkCommand";
import { RecallCommand } from "../RecallCommand";
import { SpaceCommand } from "../SpaceCommand";
import { MoveCommand } from "../MoveCommand";
import { ReviewCommand } from "../ReviewCommand";
import { GroupCommand } from "../GroupCommand";
import { UngroupCommand } from "../UngroupCommand";

class MockAgentGateway implements AgentGateway {
  async ask(): Promise<AgentCardResponse[]> {
    return [{ title: "A", body: "alpha" }];
  }
  async fetchModels(): Promise<AgentModel[]> {
    return [];
  }
}

const WS = "ws-1";

function buildRunner(repo: MemoryCardRepository): PipelineRunner {
  const gw = new MockAgentGateway();
  return new PipelineRunner([
    new AskCommand(gw, repo),
    new SourceCommand(repo),
    new ChunkCommand(gw, repo),
    new RecallCommand(repo),
    new SpaceCommand(repo),
    new MoveCommand(repo),
    new ReviewCommand(),
    new GroupCommand(new GroupCardsInteractor(repo)),
    new UngroupCommand(repo),
  ]);
}

function env(overrides: Partial<PipelineEnvironment> = {}): PipelineEnvironment {
  return {
    workspaceId: WS,
    parentId: null,
    initialInputCards: [],
    workspaces: [],
    apiKey: "k",
    model: "m",
    systemPrompt: "p",
    autoGroup: false,
    ...overrides,
  };
}

describe("grouping", () => {
  it("group command nests selected cards under a new group", async () => {
    const repo = new MemoryCardRepository();
    const runner = buildRunner(repo);
    const c1 = createCard({ workspaceId: WS, type: "chunk", title: "C1", body: "x" });
    const c2 = createCard({ workspaceId: WS, type: "chunk", title: "C2", body: "y" });
    await repo.saveCards([c1, c2]);

    const outcome = await runner.run('group "My Group"', env({ initialInputCards: [c1, c2] }));

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    const group = outcome.cards[0];
    expect(group.type).toBe("group");
    expect(group.title).toBe("My Group");
    expect((await repo.getCard(c1.id))?.parentId).toBe(group.id);
    expect((await repo.getCard(c2.id))?.parentId).toBe(group.id);
  });

  it("auto-group composes a trailing group named after the command", async () => {
    const repo = new MemoryCardRepository();
    const runner = buildRunner(repo);
    const source = createCard({ workspaceId: WS, type: "source", title: "S", body: "One. Two. Three things here." });
    await repo.saveCard(source);

    const outcome = await runner.run("chunk", env({ initialInputCards: [source], autoGroup: true }));

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.cards.length).toBe(1);
    expect(outcome.cards[0].type).toBe("group");
    expect(outcome.cards[0].title).toBe("chunk");

    const all = await repo.getCardsByWorkspace(WS);
    const chunks = all.filter(c => c.type === "chunk");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every(c => c.parentId === outcome.cards[0].id)).toBe(true);
  });

  it("auto-group triggers for custom commands that are not in the reserved list", async () => {
    const repo = new MemoryCardRepository();
    const customCommand = {
      name: "explain-simply",
      execute: async () => ({
        kind: "cards",
        cards: [createCard({ workspaceId: WS, type: "chunk", title: "A", body: "a" })]
      })
    } as any;
    const runner = new PipelineRunner([customCommand, new GroupCommand(new GroupCardsInteractor(repo))]);

    const outcome = await runner.run("explain-simply", env({ autoGroup: true }));

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.cards.length).toBe(1);
    expect(outcome.cards[0].type).toBe("group");
    expect(outcome.cards[0].title).toBe("explain-simply");
  });

  it("auto-group off leaves output ungrouped", async () => {
    const repo = new MemoryCardRepository();
    const runner = buildRunner(repo);
    const source = createCard({ workspaceId: WS, type: "source", title: "S", body: "One. Two." });

    const outcome = await runner.run("chunk", env({ initialInputCards: [source], autoGroup: false }));

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.cards.every(c => c.type === "chunk")).toBe(true);
    expect((await repo.getCardsByWorkspace(WS)).some(c => c.type === "group")).toBe(false);
  });

  it("new cards are created under the current group (parentId)", async () => {
    const repo = new MemoryCardRepository();
    const runner = buildRunner(repo);

    const outcome = await runner.run('source "https://example.com"', env({ parentId: "g-current", autoGroup: false }));

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.cards[0].parentId).toBe("g-current");
  });

  it("ungroup dissolves a group and frees its children up one level", async () => {
    const repo = new MemoryCardRepository();
    const runner = buildRunner(repo);
    const group = createCard({ id: "g", workspaceId: WS, type: "group", title: "G", body: "" });
    const child = createCard({ workspaceId: WS, type: "chunk", title: "C", body: "x", parentId: "g" });
    await repo.saveCards([group, child]);

    const outcome = await runner.run("ungroup", env({ initialInputCards: [group] }));

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(await repo.getCard("g")).toBeNull();
    expect((await repo.getCard(child.id))?.parentId).toBeUndefined();
    expect(outcome.cards.map(c => c.id)).toContain(child.id);
  });
});
