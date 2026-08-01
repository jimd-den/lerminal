import { Card } from "../../../entities/card";
import { AssistantCapability, OutputContractKind } from "../../../entities/assistantProfile";
import { WebCitation } from "../../../entities/webCitation";

/**
 * # Agent Gateway Interface
 * 
 * ## Business Value & Purpose
 * Defines the contract for requesting learning materials from AI agents and designing
 * goal-specific AI assistance profiles with a prompt architect model.
 * By defining this contract, we can swap between OpenRouter, local models,
 * or mock agents seamlessly without changing how pipelines process the resulting cards.
 */

export interface AgentCardResponse {
  title: string;
  body: string;
  sourceCardId?: string;
  sourceExcerpt?: string;
}

/**
 * The outcome of an agent request, including **whether a model actually answered**.
 *
 * This is a result object rather than a bare array for one reason: a gateway that cannot
 * reach a model may still return usable placeholder content, and a caller must not be
 * able to pass that off as a model's work by accident. Making the distinction part of the
 * type means every call site has to acknowledge it — silence is no longer expressible.
 *
 * Without it, the app's central promise ("you can tell where an answer came from") had a
 * hole exactly where it mattered most.
 */
export interface AgentAskResult {
  cards: AgentCardResponse[];
  /**
   * True when `cards` were generated locally from a template because no model answered —
   * a missing API key, a network failure, or an unparseable response.
   */
  isLocalFallback: boolean;
  /** Why the fallback happened, in the user's terms. Present only when `isLocalFallback`. */
  fallbackReason?: string;
}

export interface AgentModel {
  id: string;
  name: string;
  free: boolean;
}

/** A single turn in a chat conversation. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Response structure returned by the AI Prompt Architect for assistant profile creation.
 */
/**
 * What a Workspace Agent turn call returns: the model's raw payload, validated by
 * `normalizeWorkspaceAgentResponse` in the entities layer. Kept as `raw` rather than a
 * typed response so the gateway cannot hand malformed output to the UI wearing the right
 * shape.
 */
export interface WorkspaceAgentTurnResult {
  /**
   * The model's reply as plain prose, tags and all — never JSON.
   *
   * Kept raw rather than pre-parsed so the gateway cannot decide what the app will act
   * on: `entities/agentTags` does the parsing, and it is the only thing that turns text
   * into an intent.
   */
  text: string;
  /**
   * Sources the provider's own search actually returned for this turn — empty when it
   * did not run, found nothing, or was switched off.
   *
   * The emptiness is the whole point: it is the *only* evidence the app accepts that the
   * web was consulted. Never infer "the agent searched" from the toggle being on — a
   * toggled-on search can return nothing, and the model can answer without invoking it.
   */
  webCitations: WebCitation[];
  /**
   * The model's own intermediate reasoning for this turn, when the provider returned any.
   *
   * Optional and never synthesized: most models return nothing here, and a gateway must
   * leave it `undefined` rather than paraphrasing the answer back as "thinking". The UI
   * shows a reasoning trace if and only if this is a non-empty string, so nothing on
   * screen can imply the model reasoned when it merely answered.
   */
  reasoning?: string;
}

export interface PromptDesignResponse {
  needsClarification: boolean;
  question: string | null;
  nameSuggestion: string;
  description: string;
  systemPrompt: string | null;
}

export interface AgentGateway {
  /**
   * Queries the agent model for cards based on a prompt and context.
   * 
   * @param query The learning query or instructions for the agent.
   * @param contextCards Optional set of selected cards to serve as reading context.
   * @param apiKey The OpenRouter API key provided by the user.
   * @param model The specific model identifier to execute.
   * @param systemPrompt The resolved profile/preset instruction (formatting-free).
   * @param outputContract Which strict output contract to append (defaults to `cards-v1`);
   *   callers should pass the resolved {@link AssistantProfile}'s `outputContract` so the
   *   instruction and its matching response shape (e.g. `chunks-v1`'s provenance fields)
   *   travel together instead of the generic card shape being silently substituted.
   * @returns The cards, plus whether a model actually produced them — see
   *   {@link AgentAskResult}. Implementations must never report `isLocalFallback: false`
   *   for content they generated themselves.
   */
  ask(
    query: string,
    contextCards: Card[],
    apiKey: string,
    model: string,
    systemPrompt?: string,
    outputContract?: OutputContractKind
  ): Promise<AgentAskResult>;

  /**
   * Fetches the list of available models from the agent provider.
   */
  fetchModels(): Promise<AgentModel[]>;

  /**
   * Streams a chat completion token-by-token. Optional so existing/mocked gateways
   * remain valid; the chat feature checks for its presence.
   *
   * @param messages The full conversation (including any system context message).
   * @param onToken Called with each incremental text delta as it arrives.
   * @returns A promise resolving to the complete assistant message text.
   */
  streamChat?(
    messages: ChatMessage[],
    apiKey: string,
    model: string,
    onToken: (delta: string) => void
  ): Promise<string>;

  /**
   * Asks the model to pick one next action for a freshly captured card, from a fixed
   * menu the caller supplies.
   *
   * A dedicated method rather than a call to {@link ask}, whose contract always demands
   * card-shaped JSON via the output-contract system — asking it to instead return a
   * chosen id and a reason would be fighting its own prompt. Returns the raw text; the
   * use-case layer parses and validates against the same menu it sent, so a hallucinated
   * id, invented action, or missing key can never surface as a suggestion.
   *
   * Optional so existing and mocked gateways remain valid.
   */
  suggestNextAction?(input: {
    /** Rendered with the card and the candidate ids already inline — see the use case. */
    prompt: string;
    apiKey: string;
    model: string;
    /** The user's edited "next-action-suggestion" prompt body, if any. */
    systemPrompt?: string;
  }): Promise<string>;

  /**
   * Streams one Workspace Agent ("Ask GRIOT") turn: ordinary prose, with any concrete
   * artifact marked by an inline tag (`entities/agentTags`). Nothing here dispatches
   * anything; the user's `+` on a chip does that, later, explicitly.
   *
   * Returns the model's text verbatim rather than anything pre-interpreted, so a gateway
   * can never present its own reading of a reply as the app's. Optional so
   * existing/mocked gateways remain valid; the workflow checks for it and produces a
   * clear failure state when absent.
   *
   * @throws when no model answered. It must never invent a turn.
   */
  designWorkspaceAgentTurn?(input: {
    /** The bounded workspace/selection context plus the conversation so far, as prose. */
    briefing: string;
    apiKey: string;
    model: string;
    /** The user's edited "workspace-agent" prompt body, if any — see `entities/agentPrompts`. */
    systemPrompt?: string;
    /**
     * Opt-*out* for the provider's own web-grounded search; defaults to on. Real sources
     * come back as {@link WorkspaceAgentTurnResult.webCitations}, and only those may be
     * shown as receipts. Distinct from `SearchGateway`, which remains the mechanism
     * behind the `search_web` tool intent and its preflight.
     */
    webSearchEnabled?: boolean;
    /**
     * Called with each increment as it is generated — text, reasoning, or both. Optional:
     * a gateway that cannot stream simply never calls it, and the caller shows the honest
     * non-streaming state rather than faking a typing effect.
     */
    onDelta?: (delta: { text?: string; reasoning?: string }) => void;
  }): Promise<WorkspaceAgentTurnResult>;

  /**
   * Prompts the AI Prompt Architect to design or refine an AssistantProfile system instruction
   * based on the user's stated learning goal.
   */
  designAssistantProfile?(input: {
    messages: ChatMessage[];
    capability: AssistantCapability;
    apiKey: string;
    model: string;
    /** The user's edited "prompt-architect" prompt body, if any. */
    systemPrompt?: string;
  }): Promise<PromptDesignResponse>;
}
