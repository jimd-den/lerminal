import { Card } from "../../entities/card";
import {
  AgentAskResult,
  AgentCardResponse,
  AgentGateway,
  AgentModel,
  ChatMessage,
  PromptDesignResponse,
} from "../../usecases/ports/gateways/AgentGateway";
import { AssistantCapability, OutputContractKind } from "../../entities/assistantProfile";
import { composeCardPrompt, DEFAULT_CARD_INSTRUCTION } from "../../entities/promptPreset";

/**
 * The Goal Architect's instruction.
 *
 * Written to constrain the failure modes that matter rather than to elicit enthusiasm: no
 * claiming to have searched, no inventing what the user said, small numbers of questions,
 * and scope reduction over aspirational planning. The app validates and re-labels
 * everything this returns anyway — the prompt is the first line of defence, not the only
 * one.
 */
const GOAL_ARCHITECT_SYSTEM_PROMPT = `You are a goal architect helping someone turn an ambition into an achievable learning mission.

You are given the user's answers so far and the app's current working map. Respond with a single JSON object:

{
  "message": "brief prose: what you noticed, or what you'd add. 2-4 sentences.",
  "question": { "id": "kebab-id", "prompt": "one high-leverage question", "rationale": "why it matters", "optional": true, "choices": ["optional", "suggested answers"] },
  "workingMap": {
    "goal": "restated goal, only if the user's is unclear",
    "deliverable": "concrete finished artifact, only if implied but unstated",
    "constraints": [], "assumptions": [], "unknowns": [],
    "prerequisites": [], "risks": [], "candidateNextActions": []
  },
  "recommendedResearch": [ { "query": "a real search query", "rationale": "why", "sourceKinds": ["official docs","comparable project","paper","tutorial"] } ]
}

Rules:
- Everything you contribute is treated as a hypothesis the user must verify. Do not state guesses as facts.
- NEVER claim you searched, read, browsed, or cited anything. You have no web access. Suggest queries in recommendedResearch; the app runs them only with the user's approval.
- Never invent what the user told you. If something is unknown, put it in "unknowns".
- Ask at most ONE question, and only if it materially reduces ambiguity. Omit "question" entirely otherwise.
- Prefer reducing scope and validating early over aspirational planning. Challenge vague goals directly but respectfully.
- Propose concrete, testable milestones and experiments. No lectures, no motivational filler.
- Omit any field you have nothing real to add to. Empty is better than padded.
- Output JSON only. No markdown fences, no commentary.`;

const PROMPT_ARCHITECT_SYSTEM_PROMPT = `You are a prompt architect for a study application.

Convert the learner's goal into a concise system instruction for one named assistant capability. Ask at most one clarifying question if needed.

The instruction must:
- Define the assistant's role and learning outcome
- State preferred depth, style, and priorities
- Require grounding in supplied material
- Tell the assistant to say when source support is missing
- Avoid output-format instructions, JSON schemas, tool use, or app policies
- Be under 250 words

Return JSON only:
{
  "needsClarification": boolean,
  "question": "string or null",
  "nameSuggestion": "string",
  "description": "string",
  "systemPrompt": "string or null"
}`;

/**
 * # OpenRouter Agent Gateway Implementation
 * 
 * ## Business Value & Purpose
 * Connects the application to modern LLMs via OpenRouter.
 * Supports card generation requests, streaming chat, live model retrieval, and AI Prompt Architect
 * profile design.
 *
 * ## Applied Design Patterns
 * - **Gateway Pattern**: Encapsulates external LLM API communication and fallback logic.
 */
export class OpenRouterAgentGateway implements AgentGateway {
  async ask(
    query: string,
    contextCards: Card[],
    apiKey: string,
    model: string,
    systemPrompt?: string,
    outputContract: OutputContractKind = "cards-v1"
  ): Promise<AgentAskResult> {
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
      return this.localFallback(query, "No OpenRouter API key is configured");
    }

    // Assemble source context
    const contextText = contextCards
      .map(card => `[Card Title: ${card.title}]\n${card.body}`)
      .join("\n\n")
      .substring(0, 3000); // Restrict length for token budgets

    // The incoming systemPrompt is treated purely as an *instruction* (what kind of
    // output to make); the strict JSON format contract matching the caller's
    // outputContract is always appended by composeCardPrompt, so any instruction yields
    // parseable output in the shape its capability actually expects.
    const instruction = systemPrompt?.trim() || DEFAULT_CARD_INSTRUCTION;
    const activeSystemPrompt = composeCardPrompt(instruction, outputContract);

    const userPrompt = `${contextText ? `Use this source context to extract and base your facts on:\n${contextText}\n\n` : ""}Query: ${query}`;

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cleanKey}`,
          "HTTP-Referer": "https://github.com/dbslim/lerminal",
          "X-Title": "GRIOT",
        },
        body: JSON.stringify({
          model: modelToUse,
          messages: [
            {
              role: "system",
              content: activeSystemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
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
        ...(item.sourceCardId ? { sourceCardId: String(item.sourceCardId) } : {}),
        ...(item.sourceExcerpt ? { sourceExcerpt: String(item.sourceExcerpt).substring(0, 300) } : {}),
      }));

      if (cards.length === 0) {
        console.warn(`[${logTimestamp}] [OpenRouterAgentGateway] Model returned no cards. Using local fallback.`);
        return this.localFallback(query, "The model returned no usable cards");
      }

      console.log(`[${logTimestamp}] [OpenRouterAgentGateway] OpenRouter SUCCESS: model=${modelToUse} | generated ${cards.length} cards`);
      // The only path that may claim a model answered.
      return { cards, isLocalFallback: false };
    } catch (err: any) {
      console.error(`[${logTimestamp}] [OpenRouterAgentGateway] request failed: ${err.message}. Falling back to local generation.`);
      return this.localFallback(query, `The model request failed: ${err?.message ?? "unknown error"}`);
    }
  }

  /**
   * Prompts the AI Prompt Architect to design or refine an AssistantProfile system instruction
   * based on the user's stated learning goal.
   */
  /**
   * Asks the model for one Goal Architect turn.
   *
   * Returns the **raw parsed payload** rather than a typed turn: validation and
   * origin-tagging happen in `normalizeGoalArchitectTurn`, so this method cannot
   * accidentally hand malformed output to the UI wearing the right shape.
   *
   * Throws rather than falling back. Every other path in this gateway can degrade to
   * locally-generated cards clearly flagged as a fallback, but there is no honest
   * fallback for a planning turn — an invented follow-up question is indistinguishable
   * from a real one, and the workflow's deterministic path is the correct answer instead.
   */
  /**
   * Asks the model to choose one next action for a card from the caller-supplied menu.
   *
   * No response-format constraint and no output-contract system prompt: the prompt
   * itself, built by `SuggestNextActionInteractor`, already specifies the exact
   * `id:`/`reason:` shape, and the interactor — not this gateway — validates the id
   * against the menu it sent. This method's only job is to get the model's raw text back.
   */
  async suggestNextAction(input: {
    prompt: string;
    apiKey: string;
    model: string;
  }): Promise<string> {
    const cleanKey = input.apiKey?.trim();
    if (!cleanKey) {
      throw new Error("API key is required to suggest a next action");
    }

    console.log(
      `[${new Date().toISOString()}] [OpenRouterAgentGateway.suggestNextAction] model="${input.model}"`
    );

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cleanKey}`,
        "HTTP-Referer": "https://github.com/dbslim/lerminal",
        "X-Title": "GRIOT",
      },
      body: JSON.stringify({
        model: input.model,
        messages: [{ role: "user", content: input.prompt }],
      }),
    });

    if (!response.ok) {
      let errMsg = `HTTP error: ${response.status} ${response.statusText}`;
      try {
        const errData = await response.json();
        if (errData?.error?.message) errMsg += ` - ${errData.error.message}`;
      } catch (_) {}
      throw new Error(errMsg);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("The model returned an empty response");
    }
    return content;
  }

  async designGoalArchitectTurn(input: {
    briefing: string;
    apiKey: string;
    model: string;
  }): Promise<unknown> {
    const cleanKey = input.apiKey?.trim();
    if (!cleanKey) {
      throw new Error("API key is required for goal planning");
    }

    console.log(
      `[${new Date().toISOString()}] [OpenRouterAgentGateway.designGoalArchitectTurn] model="${input.model}" | briefingChars=${input.briefing.length}`
    );

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cleanKey}`,
        "HTTP-Referer": "https://github.com/dbslim/lerminal",
        "X-Title": "GRIOT",
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          { role: "system", content: GOAL_ARCHITECT_SYSTEM_PROMPT },
          { role: "user", content: input.briefing },
        ],
        // The turn is consumed as JSON; asking for it directly beats parsing prose.
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      let errMsg = `HTTP error: ${response.status} ${response.statusText}`;
      try {
        const errData = await response.json();
        if (errData?.error?.message) errMsg += ` - ${errData.error.message}`;
      } catch (_) {}
      throw new Error(errMsg);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("The model returned an empty response");
    }

    // Some models still wrap JSON in a fence despite response_format.
    const cleanJson = content
      .replace(/^```json/i, "")
      .replace(/^```/, "")
      .replace(/```$/, "")
      .trim();

    try {
      return JSON.parse(cleanJson);
    } catch {
      // Deliberately not salvaged into a partial turn — the caller shows an honest
      // failure state and keeps the user's answers.
      throw new Error("The model's reply was not valid JSON");
    }
  }

  async designAssistantProfile(input: {
    messages: ChatMessage[];
    capability: AssistantCapability;
    apiKey: string;
    model: string;
  }): Promise<PromptDesignResponse> {
    const logTimestamp = new Date().toISOString();
    const cleanKey = input.apiKey?.trim();
    if (!cleanKey) {
      throw new Error("API key is required to design assistant profiles");
    }

    console.log(`[${logTimestamp}] [OpenRouterAgentGateway.designAssistantProfile] capability=${input.capability} | messagesCount=${input.messages.length}`);

    const payloadMessages: ChatMessage[] = [
      { role: "system", content: `${PROMPT_ARCHITECT_SYSTEM_PROMPT}\nTarget capability: ${input.capability}` },
      ...input.messages,
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cleanKey}`,
        "HTTP-Referer": "https://github.com/dbslim/lerminal",
        "X-Title": "GRIOT",
      },
      body: JSON.stringify({
        model: input.model,
        messages: payloadMessages,
      }),
    });

    if (!response.ok) {
      let errMsg = `HTTP error: ${response.status} ${response.statusText}`;
      try {
        const errData = await response.json();
        if (errData?.error?.message) errMsg += ` - ${errData.error.message}`;
      } catch (_) {}
      throw new Error(errMsg);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "{}";
    const cleanJson = content
      .replace(/^```json/i, "")
      .replace(/^```/, "")
      .replace(/```$/, "")
      .trim();

    try {
      const parsed = JSON.parse(cleanJson);
      return {
        needsClarification: Boolean(parsed.needsClarification),
        question: parsed.question || null,
        nameSuggestion: parsed.nameSuggestion || "Custom Assistant",
        description: parsed.description || "Custom AI assistance profile",
        systemPrompt: parsed.systemPrompt || null,
      };
    } catch {
      return {
        needsClarification: false,
        question: null,
        nameSuggestion: "Custom Assistant",
        description: "Custom AI assistance profile",
        systemPrompt: content,
      };
    }
  }

  /**
   * Streams a chat completion using SSE.
   */
  streamChat(
    messages: ChatMessage[],
    apiKey: string,
    model: string,
    onToken: (delta: string) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const cleanKey = apiKey?.trim();
      if (!cleanKey) {
        reject(new Error("Missing OpenRouter API key"));
        return;
      }

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "https://openrouter.ai/api/v1/chat/completions");
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("Authorization", `Bearer ${cleanKey}`);
      xhr.setRequestHeader("HTTP-Referer", "https://github.com/dbslim/lerminal");
      xhr.setRequestHeader("X-Title", "GRIOT");

      let processed = 0;
      let full = "";

      const drain = () => {
        const data = xhr.responseText;
        let nl: number;
        while ((nl = data.indexOf("\n", processed)) !== -1) {
          const line = data.substring(processed, nl).trim();
          processed = nl + 1;
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "" || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content || "";
            if (delta) {
              full += delta;
              onToken(delta);
            }
          } catch {
            // Ignore keep-alive comments / partial fragments.
          }
        }
      };

      xhr.onprogress = drain;
      xhr.onload = () => {
        drain();
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(full);
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText?.substring(0, 200) || xhr.statusText}`));
        }
      };
      xhr.onerror = () => reject(new Error("Network error while streaming"));

      xhr.send(JSON.stringify({ model, stream: true, messages }));
    });
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
      console.warn(`[${logTimestamp}] [OpenRouterAgentGateway.fetchModels] Warning: ${err.message}. Returning empty model list.`);
      return [];
    }
  }

  /**
   * Wraps the local template in its tag. Every fallback path goes through here, so it is
   * structurally impossible for template content to escape this class claiming a model
   * wrote it — which is precisely the bug this replaced.
   */
  private localFallback(query: string, reason: string): AgentAskResult {
    return {
      cards: this.generateLocalFallback(query),
      isLocalFallback: true,
      fallbackReason: reason,
    };
  }

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
