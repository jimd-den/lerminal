import { describe, expect, it } from "bun:test";
import { AskCommand } from "../AskCommand";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { AgentGateway, AgentAskResult, AgentCardResponse } from "../../ports/gateways/AgentGateway";
import { Card } from "../../../entities/card";
import { CommandContext } from "../Command";
import { BUILTIN_ASSISTANT_PROFILES } from "../../../entities/assistantProfile";

class CapturingAgentGateway implements AgentGateway {
  lastQuery = "";
  lastSystemPrompt = "";

  async ask(query: string, _contextCards: Card[], _apiKey: string, _model: string, systemPrompt?: string): Promise<AgentAskResult> {
    this.lastQuery = query;
    this.lastSystemPrompt = systemPrompt ?? "";
    return { cards: [{ title: "T", body: "B" }], isLocalFallback: false };
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

describe("AskCommand provenance", () => {
  it("records on each card that a model genuinely answered", async () => {
    const gateway = new CapturingAgentGateway();
    const cmd = new AskCommand(gateway, new MemoryCardRepository());

    const result = await cmd.execute('"a question"', baseCtx());

    const cards = result.kind === "cards" ? result.cards : [];
    expect(cards[0].provenance?.mode).toBe("agent");
    expect(cards[0].provenance?.isLocalFallback).toBeUndefined();
  });

  it("marks cards as a local fallback when no model answered", async () => {
    const falling: AgentGateway = {
      async ask(): Promise<AgentAskResult> {
        return {
          cards: [{ title: "Core idea", body: "template text" }],
          isLocalFallback: true,
          fallbackReason: "No OpenRouter API key is configured",
        };
      },
      async fetchModels() { return []; },
    };
    const cmd = new AskCommand(falling, new MemoryCardRepository());

    const result = await cmd.execute('"a question"', baseCtx());

    const cards = result.kind === "cards" ? result.cards : [];
    // The card itself carries the truth, permanently — not just a transient banner.
    expect(cards[0].provenance?.isLocalFallback).toBe(true);
  });
});

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
