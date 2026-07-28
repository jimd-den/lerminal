import { describe, expect, it } from "bun:test";
import { SuggestSearchQueriesInteractor } from "../SuggestSearchQueriesInteractor";
import { AgentGateway, AgentCardResponse } from "../../../adapters/gateways/AgentGateway";
import { Card } from "../../../entities/card";
import { MissingApiKeyError, AgentRequestError } from "../../errors";

class StubAgentGateway implements AgentGateway {
  lastSystemPrompt = "";
  constructor(private response: AgentCardResponse[]) {}
  async ask(_query: string, _contextCards: Card[], _apiKey: string, _model: string, systemPrompt?: string): Promise<AgentCardResponse[]> {
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
});
