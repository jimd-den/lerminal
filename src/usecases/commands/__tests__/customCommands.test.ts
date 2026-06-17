import { describe, expect, it } from "bun:test";
import { Card } from "../../../entities/card";
import { AgentCommandDefinition } from "../../../entities/commandDefinition";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { MemoryCommandDefinitionRepository } from "../../../adapters/repositories/MemoryCommandDefinitionRepository";
import { AgentCardResponse, AgentGateway, AgentModel } from "../../../adapters/gateways/AgentGateway";
import {
  DuplicateCommandNameError,
  InvalidCommandNameError,
  ReservedCommandNameError,
} from "../../errors";
import { CreateCommandDefinitionInteractor } from "../CreateCommandDefinitionInteractor";
import { DeleteCommandDefinitionInteractor } from "../DeleteCommandDefinitionInteractor";
import { createPipelineCommand } from "../../pipeline/CommandFactory";
import { CommandContext } from "../../pipeline/Command";

class CapturingAgentGateway implements AgentGateway {
  lastSystemPrompt?: string;
  async ask(_q: string, _c: Card[], _k: string, _m: string, systemPrompt?: string): Promise<AgentCardResponse[]> {
    this.lastSystemPrompt = systemPrompt;
    return [{ title: "T", body: "B" }];
  }
  async fetchModels(): Promise<AgentModel[]> {
    return [];
  }
}

const ctx = (over: Partial<CommandContext> = {}): CommandContext => ({
  workspaceId: "w",
  parentId: null,
  inputCards: [],
  workspaces: [],
  apiKey: "k",
  model: "m",
  systemPrompt: "global",
  ...over,
});

describe("CreateCommandDefinitionInteractor", () => {
  it("creates and persists a normalized custom command", async () => {
    const repo = new MemoryCommandDefinitionRepository();
    const def = await new CreateCommandDefinitionInteractor(repo).execute({
      name: "  Explain Simply ",
      description: "ELI5",
      systemPrompt: "Explain like I am five.",
    });
    expect(def.name).toBe("explain-simply");
    expect(def.kind).toBe("agent");
    expect((await repo.getDefinitions()).length).toBe(1);
  });

  it("rejects malformed names", async () => {
    const repo = new MemoryCommandDefinitionRepository();
    await expect(
      new CreateCommandDefinitionInteractor(repo).execute({ name: "!!", systemPrompt: "x" })
    ).rejects.toBeInstanceOf(InvalidCommandNameError);
  });

  it("rejects built-in names", async () => {
    const repo = new MemoryCommandDefinitionRepository();
    await expect(
      new CreateCommandDefinitionInteractor(repo).execute({ name: "chunk", systemPrompt: "x" })
    ).rejects.toBeInstanceOf(ReservedCommandNameError);
  });

  it("rejects duplicate names", async () => {
    const repo = new MemoryCommandDefinitionRepository();
    const interactor = new CreateCommandDefinitionInteractor(repo);
    await interactor.execute({ name: "explain", systemPrompt: "x" });
    await expect(interactor.execute({ name: "explain", systemPrompt: "y" })).rejects.toBeInstanceOf(
      DuplicateCommandNameError
    );
  });
});

describe("DeleteCommandDefinitionInteractor", () => {
  it("removes a definition", async () => {
    const repo = new MemoryCommandDefinitionRepository();
    const def = await new CreateCommandDefinitionInteractor(repo).execute({ name: "explain", systemPrompt: "x" });
    await new DeleteCommandDefinitionInteractor(repo).execute(def.id);
    expect((await repo.getDefinitions()).length).toBe(0);
  });
});

describe("CommandFactory + CustomAgentCommand", () => {
  const definition: AgentCommandDefinition = {
    id: "1",
    name: "explain",
    description: "d",
    kind: "agent",
    systemPrompt: "Explain like I am five.",
    createdAt: 0,
  };

  it("builds a command that runs the agent with the definition's prompt", async () => {
    const gateway = new CapturingAgentGateway();
    const cardRepo = new MemoryCardRepository();
    const command = createPipelineCommand(definition, { agentGateway: gateway, cardRepo });

    expect(command.name).toBe("explain");
    const result = await command.execute("photosynthesis", ctx({ parentId: "g1" }));

    expect(gateway.lastSystemPrompt).toBe("Explain like I am five.");
    expect(result.kind).toBe("cards");
    if (result.kind !== "cards") return;
    expect(result.cards[0].parentId).toBe("g1");
    expect((await cardRepo.getCardsByWorkspace("w")).length).toBe(1);
  });

  it("halts for input (reporting its own name) when given no argument", async () => {
    const command = createPipelineCommand(definition, {
      agentGateway: new CapturingAgentGateway(),
      cardRepo: new MemoryCardRepository(),
    });
    expect(await command.execute("", ctx())).toEqual({ kind: "needsInput", mode: "ask" });
  });
});
