import { AgentGateway, AgentModel } from "../../adapters/gateways/AgentGateway";

/**
 * # Load Models Interactor
 *
 * ## Business Value & Purpose
 * Fetches the list of models the agent provider currently offers so the user can
 * pick one in settings. The presenter owns the loading flag and applies the result.
 */
export class LoadModelsInteractor {
  constructor(private readonly agentGateway: AgentGateway) {}

  async execute(): Promise<AgentModel[]> {
    return this.agentGateway.fetchModels();
  }
}
