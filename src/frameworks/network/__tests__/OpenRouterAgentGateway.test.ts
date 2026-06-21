import { describe, expect, it, mock } from "bun:test";
import { OpenRouterAgentGateway } from "../OpenRouterAgentGateway";
import { createCard } from "../../../entities/card";

describe("OpenRouter Agent Gateway", () => {
  it("should format request body and parse response array correctly", async () => {
    // Mock global fetch
    const mockResponseCards = [
      { title: "React State", body: "State is local component memory." },
      { title: "React Props", body: "Props are read-only properties passed down." }
    ];

    const originalFetch = global.fetch;
    global.fetch = mock(async (url: any, options: any) => {
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect(options.method).toBe("POST");
      expect(options.headers["Authorization"]).toBe("Bearer test-api-key");
      
      const body = JSON.parse(options.body);
      expect(body.model).toBe("google/gemini-2.5-flash");
      expect(body.messages.length).toBe(1);

      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(mockResponseCards)
              }
            }
          ]
        })
      } as Response;
    });

    try {
      const gateway = new OpenRouterAgentGateway();
      const contextCard = createCard({
        workspaceId: "ws-1",
        type: "source",
        title: "React Intro",
        body: "React is a JavaScript library.",
      });

      const cards = await gateway.ask(
        "explain state and props",
        [contextCard],
        "test-api-key",
        "google/gemini-2.5-flash"
      );

      expect(cards.length).toBe(2);
      expect(cards[0].title).toBe("React State");
      expect(cards[0].body).toBe("State is local component memory.");
      expect(cards[1].title).toBe("React Props");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("should use the provided model string without hardcoding a fallback", async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      expect(body.model).toBe("");
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "[]" } }]
        })
      } as Response;
    });

    try {
      const gateway = new OpenRouterAgentGateway();
      await gateway.ask("test", [], "key", "");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("should utilize a custom system prompt and append JSON format instructions if missing", async () => {
    const originalFetch = global.fetch;
    const customPrompt = "Custom instructions for card output.";
    let capturedBody: any = null;
    
    global.fetch = mock(async (url: any, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "[]" } }]
        })
      } as Response;
    });

    try {
      const gateway = new OpenRouterAgentGateway();
      await gateway.ask("test-query", [], "key", "google/gemini-2.5-flash", customPrompt);
      
      expect(capturedBody).not.toBeNull();
      expect(capturedBody.messages[0].content).toContain(customPrompt);
      expect(capturedBody.messages[0].content).toContain("Respond ONLY with a valid JSON array");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("should not append JSON format instructions if the custom prompt already asks for a json array", async () => {
    const originalFetch = global.fetch;
    const customPrompt = "Respond with a valid json array of cards.";
    let capturedBody: any = null;
    
    global.fetch = mock(async (url: any, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "[]" } }]
        })
      } as Response;
    });

    try {
      const gateway = new OpenRouterAgentGateway();
      await gateway.ask("test-query", [], "key", "google/gemini-2.5-flash", customPrompt);
      
      expect(capturedBody).not.toBeNull();
      expect(capturedBody.messages[0].content).toContain(customPrompt);
      expect(capturedBody.messages[0].content).not.toContain("Respond ONLY with a valid JSON array of objects (no prose");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("OpenRouter Agent Gateway - fetchModels", () => {
  it("should return parsed models on successful fetch", async () => {
    const mockModelsResponse = {
      data: [
        { id: "model/1", name: "Model One" },
        { id: "model/2:free", name: "Model Two" },
      ]
    };

    const originalFetch = global.fetch;
    global.fetch = mock(async (url: any) => {
      expect(url).toBe("https://openrouter.ai/api/v1/models");
      return {
        ok: true,
        json: async () => mockModelsResponse
      } as Response;
    });

    try {
      const gateway = new OpenRouterAgentGateway();
      const models = await gateway.fetchModels();
      expect(models.length).toBe(2);
      expect(models[0].id).toBe("model/1");
      expect(models[0].free).toBe(false);
      expect(models[1].id).toBe("model/2:free");
      expect(models[1].free).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("should log a warning and return default list on fetch failure", async () => {
    const originalFetch = global.fetch;
    const originalWarn = console.warn;
    const originalError = console.error;
    
    let warnCalled = false;
    let errorCalled = false;
    
    console.warn = mock((...args: any[]) => { warnCalled = true; });
    console.error = mock((...args: any[]) => { errorCalled = true; });

    global.fetch = mock(async () => {
      throw new Error("fetch failed: java.net.UnknownHostException");
    });

    try {
      const gateway = new OpenRouterAgentGateway();
      const models = await gateway.fetchModels();
      
      expect(models.length).toBeGreaterThan(0);
      expect(models[0].id).toBe("google/gemini-2.5-flash:free");
      
      // We expect a warning to be logged, not an error, because it's an expected fallback scenario
      expect(warnCalled).toBe(true);
      expect(errorCalled).toBe(false);
    } finally {
      global.fetch = originalFetch;
      console.warn = originalWarn;
      console.error = originalError;
    }
  });
});
