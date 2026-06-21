import { describe, expect, it } from "bun:test";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { AgentCardResponse, AgentGateway, AgentModel } from "../../../adapters/gateways/AgentGateway";
import { createCommandDefinition, PipelineCommandDefinition } from "../../../entities/commandDefinition";
import { PipelineCycleError } from "../../errors";
import { PipelineEnvironment, PipelineRunner } from "../PipelineRunner";
import { createPipelineCommand } from "../CommandFactory";
import { AskCommand } from "../AskCommand";
import { ChunkCommand } from "../ChunkCommand";
import { RecallCommand } from "../RecallCommand";
import { SpaceCommand } from "../SpaceCommand";

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

/**
 * Builds a runner whose command set includes the given pipeline-macro definitions,
 * mirroring how the controller wires macros via a lazy runner thunk.
 */
function buildRunner(cardRepo: MemoryCardRepository, defs: PipelineCommandDefinition[]): PipelineRunner {
  const gw = new MockAgentGateway();
  // eslint-disable-next-line prefer-const
  let runner: PipelineRunner;
  const builtins = [
    new AskCommand(gw, cardRepo),
    new ChunkCommand(gw, cardRepo),
    new RecallCommand(cardRepo),
    new SpaceCommand(cardRepo),
  ];
  const macros = defs.map(def =>
    createPipelineCommand(def, { agentGateway: gw, cardRepo, getRunner: () => runner })
  );
  runner = new PipelineRunner([...builtins, ...macros]);
  return runner;
}

function env(overrides: Partial<PipelineEnvironment> = {}): PipelineEnvironment {
  return {
    workspaceId: WS_ID,
    parentId: null,
    initialInputCards: [],
    workspaces: [],
    apiKey: "k",
    model: "m",
    systemPrompt: "p",
    chunkSystemPrompt: "cp",
    autoGroup: false,
    ...overrides,
  };
}

function macro(name: string, body: string): PipelineCommandDefinition {
  return createCommandDefinition({ name, kind: "pipeline", body }) as PipelineCommandDefinition;
}

describe("PipelineMacroCommand", () => {
  it("expands a saved pipeline and produces its final stage's cards", async () => {
    const repo = new MemoryCardRepository();
    const runner = buildRunner(repo, [macro("learn", 'ask "react" | recall | space')]);

    const outcome = await runner.run("learn", env());

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.cards.length).toBeGreaterThan(0);
    expect(outcome.cards.every(c => c.type === "question" && c.schedule)).toBe(true);
  });

  it("substitutes the invocation argument into $1 placeholders", async () => {
    const repo = new MemoryCardRepository();
    const runner = buildRunner(repo, [macro("gen", 'ask "$1"')]);

    const outcome = await runner.run('gen "eigenvectors"', env());

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.cards[0].body).toContain("eigenvectors");
  });

  it("propagates needsInput when an inner stage needs input", async () => {
    const repo = new MemoryCardRepository();
    const runner = buildRunner(repo, [macro("g", "ask")]);

    const outcome = await runner.run("g", env());

    expect(outcome).toEqual({ kind: "needsInput", mode: "ask", command: "g" });
  });

  it("rejects direct and transitive recursion with PipelineCycleError", async () => {
    const repo = new MemoryCardRepository();
    const selfRunner = buildRunner(repo, [macro("loop", "loop")]);
    await expect(selfRunner.run("loop", env())).rejects.toBeInstanceOf(PipelineCycleError);

    const mutual = buildRunner(repo, [macro("a", "b"), macro("b", "a")]);
    await expect(mutual.run("a", env())).rejects.toBeInstanceOf(PipelineCycleError);
  });

  it("composes a macro alongside built-ins in a larger pipeline", async () => {
    const repo = new MemoryCardRepository();
    const runner = buildRunner(repo, [macro("gen", 'ask "topic"')]);

    const outcome = await runner.run("gen | recall", env());

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.cards.every(c => c.type === "question")).toBe(true);
  });
});
