import { Card } from "../../entities/card";
import { AgentCardResponse, AgentGateway, AgentModel } from "../../adapters/gateways/AgentGateway";

/**
 * # OpenRouter Agent Gateway Implementation
 * 
 * ## Business Value & Purpose
 * Connects the application to modern LLMs via the OpenRouter service.
 * Learnimal follows a 'bring-your-own-key' policy to empower users and avoid model lock-in.
 * This class translates user prompts and active source text cards into structured prompt payloads,
 * requests cards from LLMs, parses the JSON response, and handles network or authentication failures
 * gracefully by falling back to localized chunk generation.
 */
export class OpenRouterAgentGateway implements AgentGateway {
  async ask(
    query: string,
    contextCards: Card[],
    apiKey: string,
    model: string,
    systemPrompt?: string
  ): Promise<AgentCardResponse[]> {
    const logTimestamp = new Date().toISOString();
    const modelToUse = model || "google/gemini-2.5-flash";
    const keyPrefix = apiKey ? `${apiKey.substring(0, 10)}... (len: ${apiKey.length})` : "EMPTY";

    // Telemetry trace for input args
    console.log(`[${logTimestamp}] [OpenRouterAgentGateway.ask] query="${query}" | contextCardsCount=${contextCards.length} | model="${modelToUse}" | apiKey="${keyPrefix}"`);

    // Fall back to local card generation if API key is not set
    if (!apiKey) {
      console.warn(`[${logTimestamp}] [OpenRouterAgentGateway] API Key is missing. Falling back to local generation.`);
      return this.generateLocalFallback(query);
    }

    // Assemble source context
    const contextText = contextCards
      .map(card => `[Card Title: ${card.title}]\n${card.body}`)
      .join("\n\n")
      .substring(0, 3000); // Restrict length for token budgets

    const defaultSystemPrompt = `You generate atomic learning cards. Respond ONLY with a valid JSON array of objects (no prose, no markdown code block formatting). Each object must have:
- "title": string (max 6 words, representing the atomic concept)
- "body": string (1-2 clear, simple sentences explaining the concept)

Each card must be a distinct, recall-ready idea.`;

    let activeSystemPrompt = systemPrompt || defaultSystemPrompt;

    // Enforce JSON parsing compatibility for custom agent commands that forget to specify it
    if (systemPrompt && systemPrompt !== defaultSystemPrompt && !systemPrompt.toLowerCase().includes("json array")) {
      activeSystemPrompt += `\n\nRespond ONLY with a valid JSON array of objects (no prose, no markdown code block formatting). Each object must have:\n- "title": string (max 6 words)\n- "body": string (1-2 clear, simple sentences).`;
    }

    const prompt = `${activeSystemPrompt}

${contextText ? `Use this source context to extract and base your facts on:\n${contextText}\n\n` : ""}Query: ${query}`;

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://github.com/dbslim/lerminal",
          "X-Title": "Learnimal",
        },
        body: JSON.stringify({
          model: modelToUse,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        let errMsg = `HTTP error: ${response.status} ${response.statusText}`;
        try {
          const errData = await response.json();
          if (errData && errData.error && errData.error.message) {
            errMsg += ` - ${errData.error.message}`;
          }
        } catch (e) {
          try {
            const text = await response.text();
            if (text) errMsg += ` - ${text.substring(0, 150)}`;
          } catch (_) {}
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim() || "[]";

      // Strip markdown json formatting blocks if present
      const cleanJson = content
        .replace(/^```json/i, "")
        .replace(/^```/, "")
        .replace(/```$/, "")
        .trim();

      const parsed = JSON.parse(cleanJson);
      if (!Array.isArray(parsed)) {
        throw new Error("Response is not a valid JSON array");
      }

      const cards: AgentCardResponse[] = parsed.map((item: any) => ({
        title: String(item.title || "Concept").substring(0, 100),
        body: String(item.body || "").substring(0, 1000),
      }));

      console.log(`[${logTimestamp}] [OpenRouterAgentGateway] OpenRouter SUCCESS: model=${modelToUse} | generated ${cards.length} cards`);
      return cards;
    } catch (err: any) {
      console.error(`[${logTimestamp}] [OpenRouterAgentGateway] request failed: ${err.message}. Falling back to local generation.`);
      return this.generateLocalFallback(query);
    }
  }

  async fetchModels(): Promise<AgentModel[]> {
    const logTimestamp = new Date().toISOString();
    console.log(`[${logTimestamp}] [OpenRouterAgentGateway.fetchModels] Fetching models from OpenRouter...`);
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models");
      if (!response.ok) {
        let errMsg = `HTTP error: ${response.status} ${response.statusText}`;
        try {
          const errData = await response.json();
          if (errData && errData.error && errData.error.message) {
            errMsg += ` - ${errData.error.message}`;
          }
        } catch (e) {
          try {
            const text = await response.text();
            if (text) errMsg += ` - ${text.substring(0, 150)}`;
          } catch (_) {}
        }
        throw new Error(errMsg);
      }
      const json = await response.json();
      if (!json || !Array.isArray(json.data)) {
        throw new Error("Invalid response format");
      }

      const models: AgentModel[] = json.data.map((m: any) => {
        const isFree = m.id.endsWith(":free") || 
          (m.pricing && parseFloat(m.pricing.prompt) === 0 && parseFloat(m.pricing.completion) === 0);
        return {
          id: m.id,
          name: m.name || m.id,
          free: isFree,
        };
      });

      console.log(`[${logTimestamp}] [OpenRouterAgentGateway.fetchModels] Retrieved ${models.length} models dynamically`);
      return models;
    } catch (err: any) {
      console.error(`[${logTimestamp}] [OpenRouterAgentGateway.fetchModels] Error: ${err.message}. Falling back to default list.`);
      return [
        { id: "google/gemini-2.5-flash:free", name: "Gemini 2.5 Flash (Free)", free: true },
        { id: "meta-llama/llama-3.1-8b-instruct:free", name: "Llama 3.1 8B (Free)", free: true },
        { id: "qwen/qwen-2.5-72b-instruct:free", name: "Qwen 2.5 72B (Free)", free: true },
        { id: "openchat/openchat-7b:free", name: "OpenChat 7B (Free)", free: true },
        { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", free: false },
        { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", free: false },
        { id: "meta-llama/llama-3.1-405b-instruct", name: "Llama 3.1 405B", free: false },
        { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", free: false },
      ];
    }
  }

  /**
   * Generates a template set of learning cards based on the query topic when API calls fail or are unconfigured.
   */
  private generateLocalFallback(query: string): AgentCardResponse[] {
    const topic = query
      .replace(/^(how|what|why|explain|tell me about|the)\s+/i, "")
      .replace(/\?$/, "")
      .trim();
    const capitalizedTopic = topic.charAt(0).toUpperCase() + topic.slice(1);

    return [
      {
        title: "Core idea",
        body: `At its heart, ${topic} is best understood as one central principle — name it in a single sentence before adding any detail.`,
      },
      {
        title: "Why it matters",
        body: `${capitalizedTopic} matters because it changes what you can predict or do; tie it to a concrete outcome you care about.`,
      },
      {
        title: "How it works",
        body: `Break ${topic} into the two or three moving parts that interact, and describe what each one does on its own.`,
      },
      {
        title: "Common mistake",
        body: `The usual error with ${topic} is to confuse it with a surface-similar idea — note the one distinction that keeps them apart.`,
      },
    ];
  }
}
