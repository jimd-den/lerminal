import { describe, expect, it } from "bun:test";
import { GenerateSyllabusInteractor } from "../GenerateSyllabusInteractor";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { AgentGateway, AgentCardResponse } from "../../../adapters/gateways/AgentGateway";
import { Card } from "../../../entities/card";
import { createWorkspaceMission } from "../../../entities/workspace";
import { MissingApiKeyError, AgentRequestError } from "../../errors";

class StubAgentGateway implements AgentGateway {
  lastQuery = "";
  constructor(private response: AgentCardResponse[]) {}
  async ask(query: string, _contextCards: Card[]): Promise<AgentCardResponse[]> {
    this.lastQuery = query;
    return this.response;
  }
  async fetchModels() {
    return [];
  }
}

const mission = createWorkspaceMission({
  goalTitle: "Ship a renderer",
  successCriteria: ["Renders a cube"],
  currentPhase: "define",
});

describe("GenerateSyllabusInteractor", () => {
  it("requires a configured API key up front", async () => {
    const interactor = new GenerateSyllabusInteractor(new StubAgentGateway([]), new MemoryCardRepository());

    await expect(
      interactor.execute({ mission, workspaceId: "w", apiKey: "", model: "m" })
    ).rejects.toBeInstanceOf(MissingApiKeyError);
  });

  it("throws (and saves nothing) when the model returns no usable items", async () => {
    const cardRepo = new MemoryCardRepository();
    const interactor = new GenerateSyllabusInteractor(new StubAgentGateway([{ title: "", body: "" }]), cardRepo);

    await expect(
      interactor.execute({ mission, workspaceId: "w", apiKey: "key", model: "m" })
    ).rejects.toBeInstanceOf(AgentRequestError);
    expect((await cardRepo.getCardsByWorkspace("w")).length).toBe(0);
  });

  it("persists a Syllabus group with ordered concept-role items carrying agent provenance", async () => {
    const cardRepo = new MemoryCardRepository();
    const gateway = new StubAgentGateway([
      { title: "Linear algebra basics", body: "Vectors and matrices first." },
      { title: "GPU pipeline fundamentals", body: "How draw calls flow." },
    ]);
    const interactor = new GenerateSyllabusInteractor(gateway, cardRepo);

    const { group, items } = await interactor.execute({ mission, workspaceId: "w", apiKey: "key", model: "m" });

    expect(group.type).toBe("group");
    expect(group.title).toBe("Syllabus: Ship a renderer");
    expect(items.length).toBe(2);
    expect(items[0].title).toBe("Linear algebra basics");
    expect(items.every(i => i.parentId === group.id)).toBe(true);
    expect(items.every(i => i.role === "concept")).toBe(true);
    expect(items.every(i => i.provenance?.mode === "agent")).toBe(true);

    // The full mission rode along in the prompt.
    expect(gateway.lastQuery).toContain("Ship a renderer");
    expect(gateway.lastQuery).toContain("Renders a cube");

    const persisted = await cardRepo.getCardsByWorkspace("w");
    expect(persisted.length).toBe(3);
  });
});
