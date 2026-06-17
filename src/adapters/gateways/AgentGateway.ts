import { Card } from "../../entities/card";

/**
 * # Agent Gateway Interface
 * 
 * ## Business Value & Purpose
 * Defines the contract for requesting learning materials from AI agents.
 * By defining this contract, we can swap between OpenRouter, local models,
 * or mock agents seamlessly without changing how pipelines process the resulting cards.
 */

export interface AgentCardResponse {
  title: string;
  body: string;
}

export interface AgentModel {
  id: string;
  name: string;
  free: boolean;
}

export interface AgentGateway {
  /**
   * Queries the agent model for cards based on a prompt and context.
   * 
   * @param query The learning query or instructions for the agent.
   * @param contextCards Optional set of selected cards to serve as reading context.
   * @param apiKey The OpenRouter API key provided by the user.
   * @param model The specific model identifier to execute.
   * @returns A promise resolving to a list of card data titles and descriptions.
   */
  ask(
    query: string,
    contextCards: Card[],
    apiKey: string,
    model: string,
    systemPrompt?: string
  ): Promise<AgentCardResponse[]>;

  /**
   * Fetches the list of available models from the agent provider.
   */
  fetchModels(): Promise<AgentModel[]>;
}
