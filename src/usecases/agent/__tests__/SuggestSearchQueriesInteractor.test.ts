import { describe, expect, it } from "bun:test";
import { SuggestSearchQueriesInteractor } from "../SuggestSearchQueriesInteractor";
import { AgentGateway, AgentCardResponse } from "../../../adapters/gateways/AgentGateway";
import { Card } from "../../../entities/card";
import { createWorkspaceMission } from "../../../entities/workspace";
import { MissingApiKeyError, AgentRequestError } from "../../errors";

class StubAgentGateway implements AgentGateway {
  lastQuery = "";
  lastSystemPrompt = "";
  constructor(private response: AgentCardResponse[]) {}
  async ask(query: string, _contextCards: Card[], _apiKey: string, _model: string, systemPrompt?: string): Promise<AgentCardResponse[]> {
    this.lastQuery = query;
    this.lastSystemPrompt = systemPrompt ?? "";
    return this.response;
  }
  async fetchModels() {
    return [];
  }
}

describe("SuggestSearchQueriesInteractor", () => {
  it("requires a configured API key before calling the gateway", async () => {
    const gateway = new StubAgentGateway([]);
    const interactor = new SuggestSearchQueriesInteractor(gateway);

    await expect(
      interactor.execute({ topic: "learn WebGPU", apiKey: "", model: "m" })
    ).rejects.toBeInstanceOf(MissingApiKeyError);
  });

  it("maps the returned card titles to query strings", async () => {
    const gateway = new StubAgentGateway([
      { title: "WebGPU official documentation", body: "Official docs angle" },
      { title: "WebGPU vs WebGL comparison", body: "Comparison angle" },
    ]);
    const interactor = new SuggestSearchQueriesInteractor(gateway);

    const queries = await interactor.execute({ topic: "learn WebGPU", apiKey: "key", model: "m" });

    expect(queries).toEqual(["WebGPU official documentation", "WebGPU vs WebGL comparison"]);
  });

  it("uses the Query Strategist system prompt", async () => {
    const gateway = new StubAgentGateway([{ title: "q", body: "b" }]);
    const interactor = new SuggestSearchQueriesInteractor(gateway);

    await interactor.execute({ topic: "learn WebGPU", apiKey: "key", model: "m" });

    expect(gateway.lastSystemPrompt).toContain("search query strategist");
  });

  it("throws when the model returns no usable query suggestions", async () => {
    const gateway = new StubAgentGateway([]);
    const interactor = new SuggestSearchQueriesInteractor(gateway);

    await expect(
      interactor.execute({ topic: "learn WebGPU", apiKey: "key", model: "m" })
    ).rejects.toBeInstanceOf(AgentRequestError);
  });

  it("includes the full mission (goal, why, deliverable, criteria, phase) in the prompt", async () => {
    const gateway = new StubAgentGateway([{ title: "q", body: "b" }]);
    const interactor = new SuggestSearchQueriesInteractor(gateway);
    const mission = createWorkspaceMission({
      goalTitle: "Ship a renderer",
      goalDescription: "Portfolio project",
      targetDeliverable: "A working demo",
      successCriteria: ["Renders a cube", "60fps"],
      currentPhase: "explore",
    });

    await interactor.execute({ topic: "WebGPU", mission, apiKey: "key", model: "m" });

    expect(gateway.lastQuery).toContain("Ship a renderer");
    expect(gateway.lastQuery).toContain("Portfolio project");
    expect(gateway.lastQuery).toContain("A working demo");
    expect(gateway.lastQuery).toContain("Renders a cube; 60fps");
    expect(gateway.lastQuery).toContain("explore");
  });

  it("enforces the return shape: drops non-string/empty titles, dedupes, and caps at 6", async () => {
    const gateway = new StubAgentGateway([
      { title: "Query A", body: "b" },
      { title: "query a", body: "duplicate, different case" },
      { title: "  ", body: "empty" },
      { title: 42 as any, body: "wrong type" },
      { title: "Query B", body: "b" },
      { title: "Query C", body: "b" },
      { title: "Query D", body: "b" },
      { title: "Query E", body: "b" },
      { title: "Query F", body: "b" },
      { title: "Query G", body: "b" },
    ]);
    const interactor = new SuggestSearchQueriesInteractor(gateway);

    const queries = await interactor.execute({ topic: "t", apiKey: "key", model: "m" });

    expect(queries.length).toBe(6);
    expect(queries[0]).toBe("Query A");
    expect(queries.filter(q => q.toLowerCase() === "query a").length).toBe(1);
  });
});
