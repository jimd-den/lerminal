import { describe, expect, it } from "bun:test";
import { GriotController } from "../GriotController";
import { MemoryCardRepository } from "../../repositories/MemoryCardRepository";
import { MemoryWorkspaceRepository } from "../../repositories/MemoryWorkspaceRepository";
import { MemorySettingsRepository } from "../../repositories/MemorySettingsRepository";
import { MemoryCommandDefinitionRepository } from "../../repositories/MemoryCommandDefinitionRepository";
import { MemoryCardTypeRepository } from "../../repositories/MemoryCardTypeRepository";
import { MemoryPromptPresetRepository } from "../../repositories/MemoryPromptPresetRepository";
import { MemoryAssistantProfileRepository } from "../../repositories/MemoryAssistantProfileRepository";
import { createCard } from "../../../entities/card";
import { createWorkspace } from "../../../entities/workspace";
import { resolveCardType } from "../../../entities/cardTypeDefinition";

/**
 * "Discuss" is retired, but chat cards users already saved are real data. These tests
 * pin that a persisted chat card still loads, still resolves to a known card type, and
 * can still be opened — and that the affordance that replaced Discuss (opening the
 * workspace agent) works from anywhere a document is on screen.
 */
async function bootWithChatCard() {
  const cardRepo = new MemoryCardRepository();
  const workspaceRepo = new MemoryWorkspaceRepository();
  const workspace = createWorkspace({ name: "My Workspace" });
  await workspaceRepo.saveWorkspace(workspace);

  const chatCard = createCard({
    workspaceId: workspace.id,
    type: "chat",
    typeId: "chat",
    title: "Eigenvectors discussion",
    body: JSON.stringify([
      { role: "user", content: "why do eigenvectors matter?" },
      { role: "assistant", content: "they are the directions a transform only scales." },
    ]),
  });
  await cardRepo.saveCard(chatCard);

  const controller = new GriotController({
    cardRepo,
    workspaceRepo,
    settingsRepo: new MemorySettingsRepository(),
    agentGateway: { async ask() { return { cards: [], isLocalFallback: true }; }, async fetchModels() { return []; } } as any,
    commandDefinitionRepo: new MemoryCommandDefinitionRepository(),
    cardTypeRepo: new MemoryCardTypeRepository(),
    promptPresetRepo: new MemoryPromptPresetRepository(),
    assistantProfileRepo: new MemoryAssistantProfileRepository(),
    searchGateway: { async search() { return []; } } as any,
    extractionGateway: { async extractText() { return ""; } } as any,
  });
  await controller.init();
  return { controller, chatCard };
}

describe("existing chat cards after the discuss retirement", () => {
  it("still loads a persisted chat card with its transcript intact", async () => {
    const { controller, chatCard } = await bootWithChatCard();

    const loaded = controller.getState().cards.find(c => c.id === chatCard.id);

    expect(loaded).toBeDefined();
    expect(loaded!.type).toBe("chat");
    expect(JSON.parse(loaded!.body)).toHaveLength(2);
  });

  it("resolves the chat card to a known (not synthetic/unknown) card type", async () => {
    const { controller, chatCard } = await bootWithChatCard();
    const loaded = controller.getState().cards.find(c => c.id === chatCard.id)!;

    const type = resolveCardType(loaded.typeId ?? loaded.type, controller.getState().cardTypes);

    expect(type.id).toBe("chat");
    expect(type.name).toBe("Chat");
  });

  it("still opens the chat card in the detail modal", async () => {
    const { controller, chatCard } = await bootWithChatCard();

    controller.openCard(chatCard.id);

    expect(controller.getState().openCardId).toBe(chatCard.id);
  });

  it("no longer exposes a chat-sending path — the workspace agent replaces it", async () => {
    const { controller } = await bootWithChatCard();

    expect((controller as any).sendChatMessage).toBeUndefined();
  });

  it("opens the workspace agent, the affordance that replaced Discuss", async () => {
    const { controller } = await bootWithChatCard();

    controller.openWorkspaceAgent();

    expect(controller.getState().workspaceAgent?.isOpen).toBe(true);
  });
});
