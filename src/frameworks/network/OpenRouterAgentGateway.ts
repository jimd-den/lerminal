import { Card } from "../../entities/card";
import {
  AgentAskResult,
  AgentCardResponse,
  AgentGateway,
  AgentModel,
  ChatMessage,
  PromptDesignResponse,
  RoundtableDesignResponse,
  RoundtableMemberDesign,
  WorkspaceAgentTurnResult,
} from "../../usecases/ports/gateways/AgentGateway";
import { AssistantCapability, OutputContractKind } from "../../entities/assistantProfile";
import { composeSystemPrompt } from "../../entities/agentPrompts";
import { WebCitation } from "../../entities/webCitation";
import { parseApaReferences } from "../../entities/apaReference";

/**
 * Whether OpenRouter's own `web` plugin rides along with a request.
 *
 * Web search is **on by default**: an assistant that can check its facts is the better
 * default for a study app, and the honesty guarantee never came from withholding search
 * — it comes from `extractWebCitations`, which reports only sources the provider
 * actually returned. Callers opt *out* (globally, from Settings), and only an explicit
 * `false` suppresses the plugin, so a caller that says nothing gets search.
 */
function webPlugins(enabled: boolean | undefined): { plugins: { id: string }[] } | {} {
  return enabled === false ? {} : { plugins: [{ id: "web" }] };
}

/**
 * OpenRouter's unified reasoning request for the workspace agent turn.
 *
 * `exclude: false` is explicit rather than implied: the whole point of asking is to be
 * able to *show* the trace, so a future default flip on the provider's side must not
 * silently strip it.
 */
const REASONING_REQUEST = { enabled: true, exclude: false } as const;

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
    // output to make). `composeSystemPrompt` wraps it in the non-editable parent layer:
    // the truthfulness rules ahead of it and the strict format contract for the caller's
    // outputContract after it, so any instruction — including one a user wrote — yields
    // parseable output in the shape its capability actually expects.
    const activeSystemPrompt = composeSystemPrompt("card-generation", systemPrompt, outputContract);

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
        // Unparseable or link-less entries are dropped rather than repaired: see
        // `parseApaReferences`. A card with no references is a normal outcome.
        ...(() => {
          const references = parseApaReferences(item.references);
          return references.length ? { references } : {};
        })(),
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
   * Asks the model to choose one next action for a card from the caller-supplied menu.
   *
   * The user message, built by `SuggestNextActionInteractor`, carries the card and the
   * candidate ids; the system message comes from the prompt registry, whose non-editable
   * layer restates the exact `id:`/`reason:` shape. The interactor — not this gateway —
   * still validates the chosen id against the menu it sent, so a hallucinated id can
   * never reach a dispatch even if the contract is ignored.
   */
  async suggestNextAction(input: {
    prompt: string;
    apiKey: string;
    model: string;
    /** The user's edited "next-action suggestion" prompt body, if they have one. */
    systemPrompt?: string;
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
        messages: [
          {
            role: "system",
            content: composeSystemPrompt("next-action-suggestion", input.systemPrompt),
          },
          { role: "user", content: input.prompt },
        ],
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

  /**
   * Streams one Workspace Agent turn.
   *
   * Plain text, not JSON. The model writes prose and embeds `[[note: …]]`-style tags; the
   * app parses them (`entities/agentTags`). There is no `response_format` on this path at
   * all — a small local model can't be held to a JSON schema, and the schema was buying us
   * a rejected turn rather than a usable one.
   *
   * Streamed over XHR + SSE, the same mechanism `streamChat` already uses (React Native's
   * `fetch` has no readable body stream), so text *and* reasoning appear as they are
   * generated rather than after the turn completes. `onDelta` receives increments only —
   * the caller accumulates, because the caller owns the message.
   *
   * Throws rather than falling back: there is no honest local substitute for a model turn.
   */
  designWorkspaceAgentTurn(input: {
    briefing: string;
    apiKey: string;
    model: string;
    systemPrompt?: string;
    webSearchEnabled?: boolean;
    onDelta?: (delta: { text?: string; reasoning?: string }) => void;
  }): Promise<WorkspaceAgentTurnResult> {
    return new Promise((resolve, reject) => {
      const cleanKey = input.apiKey?.trim();
      if (!cleanKey) {
        reject(new Error("API key is required for the workspace agent"));
        return;
      }

      console.log(
        `[${new Date().toISOString()}] [OpenRouterAgentGateway.designWorkspaceAgentTurn] model="${input.model}" | briefingChars=${input.briefing.length} | streaming`
      );

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "https://openrouter.ai/api/v1/chat/completions");
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("Authorization", `Bearer ${cleanKey}`);
      xhr.setRequestHeader("HTTP-Referer", "https://github.com/dbslim/lerminal");
      xhr.setRequestHeader("X-Title", "GRIOT");

      let processed = 0;
      let text = "";
      let reasoning = "";
      const citations: WebCitation[] = [];
      const seenCitations = new Set<string>();

      /** Citations arrive with or after the final chunk; collected wherever they appear. */
      const collectCitations = (carrier: any): void => {
        for (const citation of extractWebCitations(carrier)) {
          if (seenCitations.has(citation.url)) continue;
          seenCitations.add(citation.url);
          citations.push(citation);
        }
      };

      const drain = () => {
        const data = xhr.responseText ?? "";
        let nl: number;
        while ((nl = data.indexOf("\n", processed)) !== -1) {
          const line = data.substring(processed, nl).trim();
          processed = nl + 1;
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "" || payload === "[DONE]") continue;

          let json: any;
          try {
            json = JSON.parse(payload);
          } catch {
            // Keep-alive comment or a fragment that hasn't finished arriving.
            continue;
          }

          const choice = json.choices?.[0];
          const delta = choice?.delta ?? choice?.message;
          collectCitations(delta);
          collectCitations(choice?.message);

          const contentDelta = typeof delta?.content === "string" ? delta.content : "";
          // The streaming equivalent of `message.reasoning`: OpenRouter puts the same
          // fields on the delta. Read through the same extractor so an encrypted block is
          // skipped here exactly as it is on a non-streamed reply.
          const reasoningDelta = extractReasoning(delta) ?? "";

          if (contentDelta) text += contentDelta;
          if (reasoningDelta) reasoning += reasoningDelta;
          if (contentDelta || reasoningDelta) {
            input.onDelta?.({
              ...(contentDelta ? { text: contentDelta } : {}),
              ...(reasoningDelta ? { reasoning: reasoningDelta } : {}),
            });
          }
        }
      };

      xhr.onprogress = drain;
      xhr.onload = () => {
        drain();
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(
            new Error(
              `HTTP ${xhr.status}: ${xhr.responseText?.substring(0, 200) || xhr.statusText}`
            )
          );
          return;
        }
        if (!text.trim()) {
          reject(new Error("The model returned an empty response"));
          return;
        }
        resolve({
          text,
          webCitations: citations,
          // Never synthesized from the answer: no reasoning returned, no reasoning field.
          ...(reasoning.trim() ? { reasoning: reasoning.trim() } : {}),
        });
      };
      xhr.onerror = () => reject(new Error("Network error while streaming"));

      xhr.send(
        JSON.stringify({
          model: input.model,
          stream: true,
          messages: [
            { role: "system", content: composeSystemPrompt("workspace-agent", input.systemPrompt) },
            { role: "user", content: input.briefing },
          ],
          // Ask for the model's own reasoning alongside the answer. OpenRouter drops the
          // parameter for models that cannot reason — those simply stream none, and no
          // reasoning UI appears at all.
          reasoning: REASONING_REQUEST,
          // On unless the user turned it off globally — see `webPlugins`. Whether it
          // actually ran is never inferred from this flag; only real citations say so.
          ...webPlugins(input.webSearchEnabled),
        })
      );
    });
  }

  async designAssistantProfile(input: {
    messages: ChatMessage[];
    capability: AssistantCapability;
    apiKey: string;
    model: string;
    /** The user's edited "prompt architect" body, if they have one. */
    systemPrompt?: string;
  }): Promise<PromptDesignResponse> {
    const logTimestamp = new Date().toISOString();
    const cleanKey = input.apiKey?.trim();
    if (!cleanKey) {
      throw new Error("API key is required to design assistant profiles");
    }

    console.log(`[${logTimestamp}] [OpenRouterAgentGateway.designAssistantProfile] capability=${input.capability} | messagesCount=${input.messages.length}`);

    const payloadMessages: ChatMessage[] = [
      {
        role: "system",
        content: `${composeSystemPrompt("prompt-architect", input.systemPrompt)}\n\nTarget capability: ${input.capability}`,
      },
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
   * Asks the roundtable architect to write a whole panel from one brief.
   *
   * One request, not one per character: the members are written against each other, and a
   * per-name loop would produce voices with no idea the others exist.
   */
  async designRoundtable(input: {
    brief: string;
    apiKey: string;
    model: string;
    systemPrompt?: string;
  }): Promise<RoundtableDesignResponse> {
    const logTimestamp = new Date().toISOString();
    const cleanKey = input.apiKey?.trim();
    if (!cleanKey) {
      throw new Error("API key is required to design a roundtable");
    }

    console.log(
      `[${logTimestamp}] [OpenRouterAgentGateway.designRoundtable] model=${input.model} | briefChars=${input.brief.length}`
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
          {
            role: "system",
            content: composeSystemPrompt("roundtable-architect", input.systemPrompt),
          },
          { role: "user", content: input.brief },
        ],
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

    let parsed: any;
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      // No salvage attempt here, unlike `designAssistantProfile`: a single prompt can be
      // recovered from raw prose, but a panel cannot — we would not know where one
      // character ends and the next begins, and guessing would invent a voice.
      throw new Error("The model's reply wasn't a usable panel. Nothing was created.");
    }

    const members: RoundtableMemberDesign[] = Array.isArray(parsed.members)
      ? parsed.members
          .map((member: any) => ({
            name: String(member?.name ?? "").trim().substring(0, 24),
            description: String(member?.description ?? "").trim().substring(0, 200),
            systemPrompt: String(member?.systemPrompt ?? "").trim(),
          }))
          // A character with no name or no instructions is not a voice. Dropping it beats
          // creating a persona that would answer as "" with no behaviour of its own.
          .filter((member: RoundtableMemberDesign) => member.name && member.systemPrompt)
      : [];

    if (members.length === 0) {
      throw new Error("The model didn't return any usable characters. Nothing was created.");
    }

    return {
      nameSuggestion: String(parsed.nameSuggestion ?? "").trim() || "Roundtable",
      members,
    };
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
        const created = Number(m.created);
        return {
          id: m.id,
          name: m.name || m.id,
          free: isFree,
          created: Number.isFinite(created) ? created : undefined,
        };
      });

      // Newest first, so the lists in settings open on what the provider just shipped
      // rather than on whatever happens to sit at the top of the API's own ordering.
      models.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));

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

/**
 * Reads real web citations back out of an OpenRouter response message.
 *
 * OpenRouter's `web` plugin attaches `annotations: [{ type: "url_citation",
 * url_citation: { url, title } }, ...]` to the assistant message when its search
 * actually ran. Parsed defensively — this is provider response shape, not a contract
 * this app controls — so an unexpected or missing shape degrades to no citations rather
 * than throwing and losing the turn the model otherwise answered correctly.
 */
/**
 * The model's own reasoning text for one turn, or `undefined` when the provider returned
 * none.
 *
 * OpenRouter exposes reasoning two ways: a plain `reasoning` string, and a
 * `reasoning_details` array whose entries may be plaintext (`reasoning.text`), a
 * provider-written summary (`reasoning.summary`), or an opaque encrypted blob
 * (`reasoning.encrypted`). Only readable text is taken; encrypted blocks are skipped
 * rather than shown as gibberish, and nothing here ever falls back to the answer itself.
 * A model that did not reason produces `undefined`, which is what keeps the UI honest.
 */
export function extractReasoning(message: any): string | undefined {
  const direct = message?.reasoning;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const details = message?.reasoning_details;
  if (!Array.isArray(details)) return undefined;

  const parts: string[] = [];
  for (const detail of details) {
    const text = detail?.text ?? detail?.summary;
    if (typeof text === "string" && text.trim()) parts.push(text.trim());
  }
  const joined = parts.join("\n\n").trim();
  return joined ? joined : undefined;
}

export function extractWebCitations(message: any): WebCitation[] {
  const annotations = message?.annotations;
  if (!Array.isArray(annotations)) return [];

  const citations: WebCitation[] = [];
  for (const item of annotations) {
    const citation = item?.url_citation;
    const url = citation?.url;
    if (typeof url !== "string" || !url) continue;
    citations.push({
      url,
      title: typeof citation?.title === "string" && citation.title ? citation.title : url,
    });
  }
  return citations;
}
