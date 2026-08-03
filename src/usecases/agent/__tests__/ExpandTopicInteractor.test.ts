import { describe, expect, it } from "bun:test";
import {
  composeTopicInstruction,
  ExpandTopicInteractor,
} from "../ExpandTopicInteractor";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import {
  AgentAskResult,
  AgentCardResponse,
  AgentGateway,
} from "../../ports/gateways/AgentGateway";
import { Card } from "../../../entities/card";
import { AgentRequestError, MissingApiKeyError } from "../../errors";
import { BUILTIN_ASSISTANT_PROFILES } from "../../../entities/assistantProfile";

class StubAgentGateway implements AgentGateway {
  lastQuery = "";
  lastSystemPrompt: string | undefined = "";
  lastModel = "";
  constructor(
    private response: AgentCardResponse[],
    private localFallback = false
  ) {}
  async ask(
    query: string,
    _contextCards: Card[],
    _apiKey: string,
    model: string,
    systemPrompt?: string
  ): Promise<AgentAskResult> {
    this.lastQuery = query;
    this.lastSystemPrompt = systemPrompt;
    this.lastModel = model;
    return {
      cards: this.response,
      isLocalFallback: this.localFallback,
      ...(this.localFallback ? { fallbackReason: "no model answered" } : {}),
    };
  }
  async fetchModels() {
    return [];
  }
}

const chaptered: AgentCardResponse[] = [
  { title: "Foundations :: Addressing modes", body: "How you walk a table at all." },
  { title: "Foundations :: Stack frames", body: "Passing records without clobbering." },
  { title: "Display :: Multiplexing", body: "More segments than pins." },
  { title: "Further reading :: PIC Microcontrollers, Katzen", body: "The standard text." },
];

const request = {
  topic: "Assembly for an LED watch",
  workspaceId: "w1",
  apiKey: "key",
  model: "app/model",
};

describe("ExpandTopicInteractor", () => {
  it("requires an API key before doing anything", async () => {
    const interactor = new ExpandTopicInteractor(
      new StubAgentGateway([]),
      new MemoryCardRepository()
    );

    await expect(interactor.execute({ ...request, apiKey: "" })).rejects.toBeInstanceOf(
      MissingApiKeyError
    );
  });

  it("refuses an empty topic rather than generating something arbitrary", async () => {
    const interactor = new ExpandTopicInteractor(
      new StubAgentGateway(chaptered),
      new MemoryCardRepository()
    );

    await expect(interactor.execute({ ...request, topic: "   " })).rejects.toBeInstanceOf(
      AgentRequestError
    );
  });

  it("saves nothing when no model actually answered", async () => {
    const cardRepo = new MemoryCardRepository();
    const interactor = new ExpandTopicInteractor(
      new StubAgentGateway(chaptered, true),
      cardRepo
    );

    // Template material would look exactly like a real answer once it is on a card.
    await expect(interactor.execute(request)).rejects.toBeInstanceOf(AgentRequestError);
    expect(await cardRepo.getCardsByWorkspace("w1")).toEqual([]);
  });

  it("builds a group of chapters with the cards nested underneath", async () => {
    const cardRepo = new MemoryCardRepository();
    const interactor = new ExpandTopicInteractor(new StubAgentGateway(chaptered), cardRepo);

    const { group, chapters, items } = await interactor.execute(request);

    expect(group.title).toBe("Assembly for an LED watch");
    expect(chapters.map(c => c.title)).toEqual(["Foundations", "Display", "Further reading"]);
    expect(chapters.every(c => c.parentId === group.id)).toBe(true);

    expect(items.map(i => i.title)).toEqual([
      "Addressing modes",
      "Stack frames",
      "Multiplexing",
      "PIC Microcontrollers, Katzen",
    ]);
    expect(items[0].parentId).toBe(chapters[0].id);
    expect(items[2].parentId).toBe(chapters[1].id);
    expect(items.every(i => i.provenance?.mode === "agent")).toBe(true);

    expect(await cardRepo.getCardsByWorkspace("w1")).toHaveLength(1 + 3 + 4);
  });

  it("nests the whole tree under the group the user is inside", async () => {
    const interactor = new ExpandTopicInteractor(
      new StubAgentGateway(chaptered),
      new MemoryCardRepository()
    );

    const { group } = await interactor.execute({ ...request, parentId: "g-open" });

    expect(group.parentId).toBe("g-open");
  });

  it("asks for the chapter convention it then parses", async () => {
    const gateway = new StubAgentGateway(chaptered);
    const interactor = new ExpandTopicInteractor(gateway, new MemoryCardRepository());

    await interactor.execute(request);

    expect(gateway.lastQuery).toContain("Assembly for an LED watch");
    expect(gateway.lastQuery).toContain("Chapter name :: Card title");
    expect(gateway.lastQuery).toContain("Further reading");
  });
});

describe("composeTopicInstruction", () => {
  const base = BUILTIN_ASSISTANT_PROFILES.find(p => p.id === "builtin-topic-architect")!
    .systemPrompt;

  it("uses the app's own instruction when there is no persona", () => {
    expect(composeTopicInstruction()).toBe(base);
    expect(composeTopicInstruction("   ")).toBe(base);
  });

  it("layers a persona's voice over the app's structure, structure first", () => {
    const composed = composeTopicInstruction("Argue the opposing case throughout.");

    expect(composed).toContain(base);
    expect(composed).toContain("Argue the opposing case throughout.");
    // Shape is stated before manner, so a persona changes how it reads and never whether
    // the app can parse it.
    expect(composed.indexOf(base)).toBeLessThan(
      composed.indexOf("Argue the opposing case throughout.")
    );
  });

  it("sends the persona's voice through to the model", async () => {
    const gateway = new StubAgentGateway(chaptered);
    const interactor = new ExpandTopicInteractor(gateway, new MemoryCardRepository());

    await interactor.execute({
      ...request,
      voicePrompt: "Always start from first principles.",
      model: "persona/model",
    });

    expect(gateway.lastSystemPrompt).toContain("Always start from first principles.");
    expect(gateway.lastModel).toBe("persona/model");
  });
});
