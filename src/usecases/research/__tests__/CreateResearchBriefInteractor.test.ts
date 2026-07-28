import { describe, expect, it } from "bun:test";
import { CreateResearchBriefInteractor } from "../CreateResearchBriefInteractor";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { AgentGateway, AgentCardResponse } from "../../../adapters/gateways/AgentGateway";
import { Card } from "../../../entities/card";
import { normalizeSearchResults, ResearchResult } from "../../../entities/research";
import { EmptySelectionError, MissingApiKeyError, UngroundedBriefError } from "../../errors";

class StubAgentGateway implements AgentGateway {
  lastContextCards: Card[] = [];
  constructor(private response: AgentCardResponse[]) {}
  async ask(_query: string, contextCards: Card[]): Promise<AgentCardResponse[]> {
    this.lastContextCards = contextCards;
    return this.response;
  }
  async fetchModels() {
    return [];
  }
}

function keptResults(): ResearchResult[] {
  const results = normalizeSearchResults(
    [
      { title: "Official Guide", url: "https://docs.example.com/guide", snippet: "the official guide says X" },
      { title: "Random blog", url: "https://blog.example.com/post", snippet: "a blog post about the topic" },
    ],
    "topic"
  );
  return [
    { ...results[0], keepState: "kept" },
    { ...results[1], keepState: "rejected" },
  ];
}

describe("CreateResearchBriefInteractor", () => {
  it("requires a configured API key up front, before ever calling the gateway", async () => {
    const gateway = new StubAgentGateway([]);
    const interactor = new CreateResearchBriefInteractor(gateway, new MemoryCardRepository());

    await expect(
      interactor.execute({
        query: "topic",
        results: keptResults(),
        workspaceId: "w",
        parentId: null,
        apiKey: "",
        model: "m",
      })
    ).rejects.toBeInstanceOf(MissingApiKeyError);
  });

  it("requires at least one kept result", async () => {
    const gateway = new StubAgentGateway([]);
    const interactor = new CreateResearchBriefInteractor(gateway, new MemoryCardRepository());
    const allRejected = keptResults().map(r => ({ ...r, keepState: "rejected" as const }));

    await expect(
      interactor.execute({
        query: "topic",
        results: allRejected,
        workspaceId: "w",
        parentId: null,
        apiKey: "key",
        model: "m",
      })
    ).rejects.toBeInstanceOf(EmptySelectionError);
  });

  it("only sends kept results as context, never rejected ones", async () => {
    const gateway = new StubAgentGateway([]);
    const interactor = new CreateResearchBriefInteractor(gateway, new MemoryCardRepository());

    try {
      await interactor.execute({
        query: "topic",
        results: keptResults(),
        workspaceId: "w",
        parentId: null,
        apiKey: "key",
        model: "m",
      });
    } catch {
      // Expected to throw UngroundedBriefError since the stub returns [] — we only care about the context sent.
    }

    expect(gateway.lastContextCards.length).toBe(1);
    expect(gateway.lastContextCards[0].cite).toBe("https://docs.example.com/guide");
  });

  it("rejects a response with no citations as ungrounded and saves nothing", async () => {
    const gateway = new StubAgentGateway([{ title: "Uncited claim", body: "Something the model said." }]);
    const cardRepo = new MemoryCardRepository();
    const interactor = new CreateResearchBriefInteractor(gateway, cardRepo);

    await expect(
      interactor.execute({
        query: "topic",
        results: keptResults(),
        workspaceId: "w",
        parentId: null,
        apiKey: "key",
        model: "m",
      })
    ).rejects.toBeInstanceOf(UngroundedBriefError);

    expect((await cardRepo.getCardsByWorkspace("w")).length).toBe(0);
  });

  it("saves only grounded (cited) claim cards with provenance pointing back to the retained URL", async () => {
    const cardRepo = new MemoryCardRepository();
    // The gateway's sourceCardId must match whatever synthetic source card id the interactor
    // generates internally, so we intercept it via a gateway that echoes it back.
    const echoGateway: AgentGateway = {
      async ask(_query, contextCards): Promise<AgentCardResponse[]> {
        const sourceId = contextCards[0].id;
        return [
          { title: "Cited claim", body: "The guide states X.", sourceCardId: sourceId, sourceExcerpt: "X" },
          { title: "Stray uncited claim", body: "Unsupported." },
        ];
      },
      async fetchModels() {
        return [];
      },
    };
    const interactor = new CreateResearchBriefInteractor(echoGateway, cardRepo);

    const created = await interactor.execute({
      query: "topic",
      results: keptResults(),
      workspaceId: "w",
      parentId: null,
      apiKey: "key",
      model: "m",
    });

    expect(created.length).toBe(1);
    expect(created[0].title).toBe("Cited claim");
    expect(created[0].role).toBe("claim");
    expect(created[0].provenance?.mode).toBe("search");
    expect(created[0].provenance?.sourceUrls).toEqual(["https://docs.example.com/guide"]);
    expect(created[0].provenance?.citations?.[0].excerpt).toBe("X");

    const persisted = await cardRepo.getCardsByWorkspace("w");
    expect(persisted.length).toBe(1);
  });
});
