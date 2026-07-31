import { Card } from "../../../entities/card";
import { AssistantCapability, OutputContractKind } from "../../../entities/assistantProfile";

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
   * Prompts the AI Prompt Architect to design or refine an AssistantProfile system instruction
   * based on the user's stated learning goal.
   */
  designAssistantProfile?(input: {
    messages: ChatMessage[];
    capability: AssistantCapability;
    apiKey: string;
    model: string;
  }): Promise<PromptDesignResponse>;
}
