import { describe, expect, it } from "bun:test";
import { RunResearchInteractor } from "../RunResearchInteractor";
import { SearchGateway, SearchResult } from "../../ports/gateways/SearchGateway";
import { ResearchNoResultsError } from "../../errors";

class FakeSearchGateway implements SearchGateway {
  constructor(private results: SearchResult[] | (() => Promise<SearchResult[]>)) {}
  async search(_query: string): Promise<SearchResult[]> {
    if (typeof this.results === "function") return this.results();
    return this.results;
  }
}

describe("RunResearchInteractor", () => {
  it("normalizes real search results into ranked, undecided candidates", async () => {
    const gateway = new FakeSearchGateway([
      { title: "Eigenvectors intro", url: "https://docs.example.com/eig", snippet: "eigenvectors explained" },
    ]);
    const interactor = new RunResearchInteractor(gateway);

    const results = await interactor.execute("eigenvectors", 5000);

    expect(results.length).toBe(1);
    expect(results[0].rank).toBe(1);
    expect(results[0].keepState).toBe("undecided");
    expect(results[0].accessedAt).toBe(5000);
  });

  it("throws ResearchNoResultsError when the gateway returns no results (network failure or true empty set)", async () => {
    const gateway = new FakeSearchGateway([]);
    const interactor = new RunResearchInteractor(gateway);

    await expect(interactor.execute("obscure query")).rejects.toBeInstanceOf(ResearchNoResultsError);
  });

  it("throws ResearchNoResultsError (not a raw error) when the gateway itself throws", async () => {
    const gateway = new FakeSearchGateway(() => {
      throw new Error("network down");
    });
    const interactor = new RunResearchInteractor(gateway);

    await expect(interactor.execute("query")).rejects.toBeInstanceOf(ResearchNoResultsError);
  });
});
