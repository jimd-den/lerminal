import { CommandDefinitionRepository } from "../../adapters/repositories/CommandDefinitionRepository";

/**
 * # Delete Command Definition Interactor
 *
 * ## Business Value & Purpose
 * Removes a custom command the user no longer wants, keeping their pipeline
 * vocabulary tidy.
 */
export class DeleteCommandDefinitionInteractor {
  constructor(private readonly repo: CommandDefinitionRepository) {}

  async execute(id: string): Promise<void> {
    await this.repo.deleteDefinition(id);
  }
}
