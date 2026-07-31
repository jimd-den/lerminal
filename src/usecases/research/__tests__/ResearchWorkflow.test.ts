import { describe, expect, it, beforeEach } from "bun:test";
import { ResearchWorkflow, ResearchHost, BriefOutcome } from "../ResearchWorkflow";
import { RunResearchInteractor } from "../RunResearchInteractor";
import { ExtractResearchResultInteractor } from "../ExtractResearchResultInteractor";
import { SaveResearchResultAsSourceInteractor } from "../SaveResearchResultAsSourceInteractor";
import { CreateResearchBriefInteractor } from "../CreateResearchBriefInteractor";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { SearchGateway, SearchResult } from "../../ports/gateways/SearchGateway";
import { ExtractionGateway } from "../../ports/gateways/ExtractionGateway";
import { AgentGateway, AgentAskResult, AgentModel } from "../../ports/gateways/AgentGateway";
import { Card } from "../../../entities/card";

class StubSearchGateway implements SearchGateway {
  results: SearchResult[] = [
    { title: "One", url: "https://example.com/1", snippet: "first" },
    { title: "Two", url: "https://example.com/2", snippet: "second" },
  ];
  shouldFail = false;

  async search(): Promise<SearchResult[]> {
    if (this.shouldFail) throw new Error("network down");
    return this.results;
  }
}

class StubExtractionGateway implements ExtractionGateway {
  shouldFail = false;
  async extractText(url: string): Promise<string> {
    if (this.shouldFail) throw new Error("blocked");
    return `full text of ${url}`;
  }
}

class StubAgentGateway implements AgentGateway {
  async ask(): Promise<AgentAskResult> {
    return { cards: [], isLocalFallback: false };
  }
  async fetchModels(): Promise<AgentModel[]> {
    return [];
  }
}

/** Records what the workflow asked the app to do, so effects can be asserted. */
class RecordingHost implements ResearchHost {
  changes = 0;
  messages: string[] = [];
  savedSources: Card[] = [];
  briefs: BriefOutcome[] = [];
  workspaceId: string | null = "w1";
  apiKey = "";

  context() {
    return {
      workspaceId: this.workspaceId,
      parentId: null,
      apiKey: this.apiKey,
      model: "some/model",
    };
  }
  onChange() {
    this.changes++;
  }
  notify(message: string) {
    this.messages.push(message);
  }
  async onSourceSaved(_workspaceId: string, card: Card) {
    this.savedSources.push(card);
  }
  async onBriefCreated(outcome: BriefOutcome) {
    this.briefs.push(outcome);
  }
}

describe("ResearchWorkflow", () => {
  let search: StubSearchGateway;
  let extraction: StubExtractionGateway;
  let cardRepo: MemoryCardRepository;
  let host: RecordingHost;
  let workflow: ResearchWorkflow;

  beforeEach(() => {
    search = new StubSearchGateway();
    extraction = new StubExtractionGateway();
    cardRepo = new MemoryCardRepository();
    host = new RecordingHost();
    workflow = new ResearchWorkflow({
      runResearch: new RunResearchInteractor(search),
      extractResult: new ExtractResearchResultInteractor(extraction),
      saveAsSource: new SaveResearchResultAsSourceInteractor(cardRepo),
      createBrief: new CreateResearchBriefInteractor(new StubAgentGateway(), cardRepo),
      host,
    });
  });

  it("opens with real candidates from an actual search", async () => {
    await workflow.start("spaced repetition");

    expect(workflow.state.isOpen).toBe(true);
    expect(workflow.state.query).toBe("spaced repetition");
    expect(workflow.state.results.map((r) => r.url)).toEqual([
      "https://example.com/1",
      "https://example.com/2",
    ]);
    expect(workflow.state.loading).toBe(false);
  });

  it("ignores an empty query rather than running a blank search", async () => {
    await workflow.start("   ");
    expect(workflow.state.isOpen).toBe(false);
    expect(host.changes).toBe(0);
  });

  it("reports a failed search instead of showing invented results", async () => {
    search.shouldFail = true;
    await workflow.start("anything");

    expect(workflow.state.error).toBeTruthy();
    expect(workflow.state.results).toEqual([]);
    expect(workflow.state.loading).toBe(false);
  });

  it("keeps and rejects candidates independently", async () => {
    await workflow.start("q");
    workflow.setKeepState("https://example.com/1", "kept");

    expect(workflow.state.results[0].keepState).toBe("kept");
    expect(workflow.state.results[1].keepState).not.toBe("kept");
  });

  it("surfaces an extraction failure as a message and leaves the candidate untouched", async () => {
    await workflow.start("q");
    extraction.shouldFail = true;
    await workflow.extract("https://example.com/1");

    expect(host.messages.length).toBe(1);
    expect(workflow.state.results[0].extractedText).toBeUndefined();
    expect(workflow.state.loading).toBe(false);
  });

  it("saves a candidate as a real source card with no API key configured", async () => {
    await workflow.start("q");
    await workflow.saveAsSource("https://example.com/1");

    expect(host.savedSources).toHaveLength(1);
    expect(workflow.state.results[0].savedCardId).toBe(host.savedSources[0].id);
    expect(await cardRepo.getCardsByWorkspace("w1")).toHaveLength(1);
  });

  it("does not save the same candidate twice", async () => {
    await workflow.start("q");
    await workflow.saveAsSource("https://example.com/1");
    await workflow.saveAsSource("https://example.com/1");

    expect(await cardRepo.getCardsByWorkspace("w1")).toHaveLength(1);
  });

  it("refuses a brief with no workspace to put it in", async () => {
    host.workspaceId = null;
    await workflow.start("q");
    expect(await workflow.createBrief()).toBe(false);
  });

  it("reports why a brief could not be made instead of creating an uncited one", async () => {
    await workflow.start("q");
    workflow.setKeepState("https://example.com/1", "kept");

    expect(await workflow.createBrief()).toBe(false);
    expect(host.messages.length).toBeGreaterThan(0);
    expect(host.briefs).toHaveLength(0);
    expect(workflow.state.isCreatingBrief).toBe(false);
  });

  it("forgets the session on close", async () => {
    await workflow.start("q");
    workflow.close();

    expect(workflow.state).toMatchObject({
      isOpen: false,
      results: [],
      query: "",
      error: null,
    });
  });
});
