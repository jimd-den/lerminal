import { describe, expect, it, mock } from "bun:test";
import { extractWebCitations, OpenRouterAgentGateway } from "../OpenRouterAgentGateway";
import { createCard } from "../../../entities/card";

describe("OpenRouter Agent Gateway", () => {
  it("carries a card's APA references through, and drops an unfollowable link", async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  title: "Spacing effect",
                  body: "Delayed recall is harder, and difficulty is the mechanism.",
                  references: [
                    { text: "Bjork, R. A. (1994). Memory and metamemory.", url: "https://example.com/b" },
                    { text: "Ebbinghaus, H. (1885). Uber das Gedachtnis.", url: "not-a-url" },
                  ],
                },
                { title: "Uncited claim", body: "No source given.", references: [] },
              ]),
            },
          },
        ],
      }),
    } as Response));

    try {
      const gateway = new OpenRouterAgentGateway();
      const result = await gateway.ask("spacing", [], "test-api-key");
      expect(result.isLocalFallback).toBe(false);
      expect(result.cards[0].references).toEqual([
        { text: "Bjork, R. A. (1994). Memory and metamemory.", url: "https://example.com/b" },
        { text: "Ebbinghaus, H. (1885). Uber das Gedachtnis." },
      ]);
      // An empty list is a legitimate answer, so no field is attached at all.
      expect(result.cards[1].references).toBeUndefined();
    } finally {
      global.fetch = originalFetch;
    }
  });

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
      expect(body.messages.length).toBe(2);
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1].role).toBe("user");
      expect(body.messages[1].content).toContain("Query: explain state and props");

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

      const result = await gateway.ask(
        "explain state and props",
        [contextCard],
        "test-api-key",
        "google/gemini-2.5-flash"
      );

      expect(result.cards.length).toBe(2);
      expect(result.cards[0].title).toBe("React State");
      expect(result.cards[0].body).toBe("State is local component memory.");
      expect(result.cards[1].title).toBe("React Props");
      // A genuine model response is the only case that may claim it wasn't a fallback.
      expect(result.isLocalFallback).toBe(false);
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

  it("always enforces the strict JSON format contract regardless of the instruction", async () => {
    const originalFetch = global.fetch;
    // An instruction that never mentions formatting at all.
    const customPrompt = "Make playful cards about the topic.";
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
      // The user instruction is preserved verbatim...
      expect(capturedBody.messages[0].content).toContain(customPrompt);
      // ...and the strict format contract is always appended.
      expect(capturedBody.messages[0].content).toContain("Respond ONLY with a valid JSON array");
      expect(capturedBody.messages[0].content).toContain("OUTPUT FORMAT (STRICT");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("appends the chunks-v1 contract and preserves provenance fields when outputContract is chunks-v1", async () => {
    const originalFetch = global.fetch;
    const chunkResponse = [
      {
        title: "Gradient descent",
        body: "Iteratively updates weights to minimize loss.",
        sourceCardId: "card-123",
        sourceExcerpt: "gradient descent is used to train the network",
      },
    ];
    let capturedBody: any = null;

    global.fetch = mock(async (url: any, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(chunkResponse) } }],
        }),
      } as Response;
    });

    try {
      const gateway = new OpenRouterAgentGateway();
      const cards = await gateway.ask(
        "goal",
        [],
        "key",
        "google/gemini-2.5-flash",
        "You are a document structure expert.",
        "chunks-v1",
      );

      expect(capturedBody.messages[0].content).toContain("sourceCardId");
      expect(capturedBody.messages[0].content).toContain("sourceExcerpt");
      expect(cards.cards[0].sourceCardId).toBe("card-123");
      expect(cards.cards[0].sourceExcerpt).toBe("gradient descent is used to train the network");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("tags an empty model response as a local fallback rather than passing it off as an answer", async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "[]" } }] }),
    }) as Response);

    try {
      const result = await new OpenRouterAgentGateway().ask(
        "memory consolidation",
        [],
        "key",
        "model",
        "Make concise cards.",
      );
      // Still returns usable placeholder content...
      expect(result.cards.length).toBeGreaterThan(0);
      // ...but says so, which is the whole point.
      expect(result.isLocalFallback).toBe(true);
      expect(result.fallbackReason).toBeTruthy();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("tags a missing API key as a local fallback, and never reaches the network", async () => {
    const originalFetch = global.fetch;
    let called = false;
    global.fetch = mock(async () => {
      called = true;
      return {} as Response;
    });

    try {
      const result = await new OpenRouterAgentGateway().ask("anything", [], "", "model");

      expect(called).toBe(false);
      expect(result.isLocalFallback).toBe(true);
      expect(result.fallbackReason).toContain("API key");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("tags a failed request as a local fallback", async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(async () => {
      throw new Error("network down");
    });

    try {
      const result = await new OpenRouterAgentGateway().ask("anything", [], "key", "model");

      expect(result.isLocalFallback).toBe(true);
      expect(result.fallbackReason).toContain("network down");
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

  it("should sort models newest first, with undated models last", async () => {
    const mockModelsResponse = {
      data: [
        { id: "model/old", name: "Old", created: 1000 },
        { id: "model/undated", name: "Undated" },
        { id: "model/new", name: "New", created: 2000 },
      ]
    };

    const originalFetch = global.fetch;
    global.fetch = mock(async () => ({
      ok: true,
      json: async () => mockModelsResponse
    } as Response));

    try {
      const gateway = new OpenRouterAgentGateway();
      const models = await gateway.fetchModels();
      expect(models.map((m) => m.id)).toEqual([
        "model/new",
        "model/old",
        "model/undated",
      ]);
      expect(models[0].created).toBe(2000);
      expect(models[2].created).toBeUndefined();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("should log a warning and return an empty list on fetch failure (no hardcoded models)", async () => {
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

      // No hardcoded fallback — failure yields an empty list.
      expect(models).toEqual([]);

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

describe("extractWebCitations", () => {
  it("reads url_citation annotations OpenRouter's web plugin attaches", () => {
    const citations = extractWebCitations({
      annotations: [
        { type: "url_citation", url_citation: { url: "https://a.com", title: "A" } },
      ],
    });

    expect(citations).toEqual([{ url: "https://a.com", title: "A" }]);
  });

  it("falls back to the URL itself when no title is given", () => {
    const citations = extractWebCitations({
      annotations: [{ type: "url_citation", url_citation: { url: "https://a.com" } }],
    });

    expect(citations).toEqual([{ url: "https://a.com", title: "https://a.com" }]);
  });

  it("skips an annotation with no usable url rather than throwing", () => {
    const citations = extractWebCitations({
      annotations: [{ type: "url_citation", url_citation: {} }, { type: "other" }],
    });

    expect(citations).toEqual([]);
  });

  it("returns no citations when the plugin wasn't used at all", () => {
    expect(extractWebCitations({})).toEqual([]);
    expect(extractWebCitations({ annotations: null })).toEqual([]);
    expect(extractWebCitations(undefined)).toEqual([]);
  });
});
