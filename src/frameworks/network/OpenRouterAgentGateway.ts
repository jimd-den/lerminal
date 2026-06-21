import { Card } from "../../entities/card";
import { AgentCardResponse, AgentGateway, AgentModel } from "../../adapters/gateways/AgentGateway";
import { composeCardPrompt, DEFAULT_CARD_INSTRUCTION } from "../../entities/promptPreset";

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
    const modelToUse = model;
    const cleanKey = apiKey?.trim() || "";
    const keyPrefix = cleanKey ? `${cleanKey.substring(0, 10)}... (len: ${cleanKey.length})` : "EMPTY";

    // Telemetry trace for input args
    console.log(`[${logTimestamp}] [OpenRouterAgentGateway.ask] query="${query}" | contextCardsCount=${contextCards.length} | model="${modelToUse}" | apiKey="${keyPrefix}"`);

    // Prevent invalid header corruption
    if (cleanKey && cleanKey.includes(" ")) {
      throw new Error("Invalid OpenRouter API key (contains spaces). Please update your key in Settings.");
    }

    // Fall back to local card generation if API key is not set
    if (!cleanKey) {
      console.warn(`[${logTimestamp}] [OpenRouterAgentGateway] API Key is missing. Falling back to local generation.`);
      return this.generateLocalFallback(query);
    }

    // Assemble source context
    const contextText = contextCards
      .map(card => `[Card Title: ${card.title}]\n${card.body}`)
      .join("\n\n")
      .substring(0, 3000); // Restrict length for token budgets

    // The incoming systemPrompt is treated purely as an *instruction* (what kind of
    // cards to make); the strict JSON format contract is always appended by
    // composeCardPrompt, so any instruction yields parseable output.
    const instruction = systemPrompt?.trim() || DEFAULT_CARD_INSTRUCTION;
    const activeSystemPrompt = composeCardPrompt(instruction);

    const prompt = `${activeSystemPrompt}

${contextText ? `Use this source context to extract and base your facts on:\n${contextText}\n\n` : ""}Query: ${query}`;

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cleanKey}`,
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
        const isFree = Boolean(
          m.id.endsWith(":free") || 
          (m.pricing && parseFloat(m.pricing.prompt) === 0 && parseFloat(m.pricing.completion) === 0)
        );
        return {
          id: m.id,
          name: m.name || m.id,
          free: isFree,
        };
      });

      console.log(`[${logTimestamp}] [OpenRouterAgentGateway.fetchModels] Retrieved ${models.length} models dynamically`);
      return models;
    } catch (err: any) {
      // No hardcoded model fallback — models are always sourced live from OpenRouter.
      // On failure return an empty list; the UI still allows entering a custom model id.
      console.warn(`[${logTimestamp}] [OpenRouterAgentGateway.fetchModels] Warning: ${err.message}. Returning empty model list.`);
      return [];
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
