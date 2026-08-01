import { describe, expect, it, beforeEach } from "bun:test";
import { GriotController } from "../GriotController";
import { MemoryCardRepository } from "../../repositories/MemoryCardRepository";
import { MemoryWorkspaceRepository } from "../../repositories/MemoryWorkspaceRepository";
import { MemorySettingsRepository } from "../../repositories/MemorySettingsRepository";
import { MemoryCommandDefinitionRepository } from "../../repositories/MemoryCommandDefinitionRepository";
import { MemoryCardTypeRepository } from "../../repositories/MemoryCardTypeRepository";
import { MemoryPromptPresetRepository } from "../../repositories/MemoryPromptPresetRepository";
import { MemoryAssistantProfileRepository } from "../../repositories/MemoryAssistantProfileRepository";
import {
  AgentGateway,
  AgentAskResult,
  AgentModel,
} from "../../../usecases/ports/gateways/AgentGateway";
import { SearchGateway, SearchResult } from "../../../usecases/ports/gateways/SearchGateway";
import { ExtractionGateway } from "../../../usecases/ports/gateways/ExtractionGateway";
import { AGENT_PROMPT_DEFINITIONS } from "../../../entities/agentPrompts";

class StubAgentGateway implements AgentGateway {
  async ask(): Promise<AgentAskResult> {
    return { cards: [], isLocalFallback: true, fallbackReason: "stub" };
  }
  async fetchModels(): Promise<AgentModel[]> {
    return [];
  }
}
class StubSearchGateway implements SearchGateway {
  async search(): Promise<SearchResult[]> {
    return [];
  }
}
class StubExtractionGateway implements ExtractionGateway {
  async extractText(): Promise<string> {
    return "";
  }
}

describe("agent prompt settings", () => {
  let settingsRepo: MemorySettingsRepository;

  const makeController = () =>
    new GriotController({
      cardRepo: new MemoryCardRepository(),
      workspaceRepo: new MemoryWorkspaceRepository(),
      settingsRepo,
      agentGateway: new StubAgentGateway(),
      commandDefinitionRepo: new MemoryCommandDefinitionRepository(),
      cardTypeRepo: new MemoryCardTypeRepository(),
      promptPresetRepo: new MemoryPromptPresetRepository(),
      assistantProfileRepo: new MemoryAssistantProfileRepository(),
      searchGateway: new StubSearchGateway(),
      extractionGateway: new StubExtractionGateway(),
    });

  beforeEach(() => {
    settingsRepo = new MemorySettingsRepository();
  });

  it("starts with no overrides and web search on", async () => {
    const controller = makeController();
    await controller.init();

    expect(controller.getState().agentPromptOverrides).toEqual({});
    expect(controller.getState().webSearchEnabled).toBe(true);
  });

  it("loads an old settings blob with no overrides and no web-search key at the defaults", async () => {
    // Exactly what someone upgrading has on disk: neither field was ever written.
    await settingsRepo.saveSettings({
      theme: "dark",
      accent: "teal",
      openRouterKey: "k",
      selectedModel: "m",
      customSystemPrompt: "p",
      autoGroupByCommand: true,
    });

    const controller = makeController();
    await controller.init();

    expect(controller.getState().agentPromptOverrides).toEqual({});
    expect(controller.getState().webSearchEnabled).toBe(true);
    // Nothing else was disturbed on the way through.
    expect(controller.getState().openRouterKey).toBe("k");
  });

  it("round-trips an override through storage", async () => {
    const controller = makeController();
    await controller.init();

    controller.setAgentPromptOverride("workspace-agent", "Be blunt and brief.");
    await Promise.resolve();

    const saved = await settingsRepo.getSettings();
    expect(saved?.agentPromptOverrides).toEqual({ "workspace-agent": "Be blunt and brief." });

    const reloaded = makeController();
    await reloaded.init();
    expect(reloaded.getState().agentPromptOverrides["workspace-agent"]).toBe(
      "Be blunt and brief.",
    );
  });

  it("resets an override back to the default", async () => {
    const controller = makeController();
    await controller.init();

    controller.setAgentPromptOverride("next-action-suggestion", "Be aggressive.");
    expect(controller.getState().agentPromptOverrides["next-action-suggestion"]).toBe("Be aggressive.");

    controller.resetAgentPrompt("next-action-suggestion");
    await Promise.resolve();

    expect(controller.getState().agentPromptOverrides["next-action-suggestion"]).toBeUndefined();
    const saved = await settingsRepo.getSettings();
    expect(saved?.agentPromptOverrides).toEqual({});
  });

  it("treats a blank override as a reset, not as an empty instruction", async () => {
    const controller = makeController();
    await controller.init();

    controller.setAgentPromptOverride("card-generation", "Terse.");
    controller.setAgentPromptOverride("card-generation", "   ");

    expect(controller.getState().agentPromptOverrides["card-generation"]).toBeUndefined();
    // And the built-in body is what a consumer would then get.
    expect(AGENT_PROMPT_DEFINITIONS["card-generation"].defaultBody.length).toBeGreaterThan(0);
  });

  it("persists the global web-search opt-out", async () => {
    const controller = makeController();
    await controller.init();

    controller.setWebSearchEnabled(false);
    await Promise.resolve();

    expect((await settingsRepo.getSettings())?.webSearchEnabled).toBe(false);

    const reloaded = makeController();
    await reloaded.init();
    expect(reloaded.getState().webSearchEnabled).toBe(false);
  });
});
