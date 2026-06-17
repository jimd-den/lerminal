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

  it("should fallback to a default model if not provided", async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      // default model fallback check
      expect(body.model).toBe("google/gemini-2.5-flash");
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
