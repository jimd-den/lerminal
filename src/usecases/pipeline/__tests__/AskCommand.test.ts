import { describe, expect, it } from "bun:test";
import { AskCommand } from "../AskCommand";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { AgentGateway, AgentCardResponse } from "../../../adapters/gateways/AgentGateway";
import { Card } from "../../../entities/card";
import { CommandContext } from "../Command";
import { BUILTIN_ASSISTANT_PROFILES } from "../../../entities/assistantProfile";

class CapturingAgentGateway implements AgentGateway {
  lastQuery = "";
  lastSystemPrompt = "";

  async ask(query: string, _contextCards: Card[], _apiKey: string, _model: string, systemPrompt?: string): Promise<AgentCardResponse[]> {
    this.lastQuery = query;
    this.lastSystemPrompt = systemPrompt ?? "";
    return [{ title: "T", body: "B" }];
  }

  async fetchModels() {
    return [];
  }
}

function baseCtx(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    workspaceId: "w",
    parentId: null,
    inputCards: [],
    workspaces: [],
    apiKey: "key",
    model: "model",
    systemPrompt: "",
    chunkSystemPrompt: "",
    assistantProfiles: BUILTIN_ASSISTANT_PROFILES,
    activeProfileIds: {},
    expansionStack: [],
    ...overrides,
  };
}

describe("AskCommand --profile parsing", () => {
  it("should strip surrounding quotes from the query after a --profile override", async () => {
    const gateway = new CapturingAgentGateway();
    const cmd = new AskCommand(gateway, new MemoryCardRepository());

    await cmd.execute('--profile builtin-chat "eigenvectors intuition"', baseCtx());

    expect(gateway.lastQuery).toBe("eigenvectors intuition");
  });

  it("should resolve the profile by id and use its system prompt", async () => {
    const gateway = new CapturingAgentGateway();
    const cmd = new AskCommand(gateway, new MemoryCardRepository());

    await cmd.execute('--profile builtin-implementation-coach "how does the scheduler work"', baseCtx());

    const coach = BUILTIN_ASSISTANT_PROFILES.find(p => p.id === "builtin-implementation-coach")!;
    expect(gateway.lastSystemPrompt).toContain(coach.systemPrompt);
  });

  it("should support a quoted profile name alongside a quoted query", async () => {
    const gateway = new CapturingAgentGateway();
    const cmd = new AskCommand(gateway, new MemoryCardRepository());

    await cmd.execute('--profile "builtin-chat" "eigenvectors intuition"', baseCtx());

    expect(gateway.lastQuery).toBe("eigenvectors intuition");
  });
});
