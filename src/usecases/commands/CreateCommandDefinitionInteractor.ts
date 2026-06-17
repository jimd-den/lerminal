import {
  CommandDefinition,
  COMMAND_NAME_PATTERN,
  createCommandDefinition,
  normalizeCommandName,
  RESERVED_COMMAND_NAMES,
} from "../../entities/commandDefinition";
import { CommandDefinitionRepository } from "../../adapters/repositories/CommandDefinitionRepository";
import {
  DuplicateCommandNameError,
  InvalidCommandNameError,
  ReservedCommandNameError,
} from "../errors";

/** Inputs for defining a custom agent command. */
export interface CreateCommandDefinitionRequest {
  name: string;
  description?: string;
  systemPrompt: string;
}

/**
 * # Create Command Definition Interactor
 *
 * ## Business Value & Purpose
 * Validates and persists a new custom command. A command name must be a single
 * lowercase token, must not shadow a built-in, and must be unique among the user's
 * commands — guarantees the pipeline parser and palette rely on.
 */
export class CreateCommandDefinitionInteractor {
  constructor(private readonly repo: CommandDefinitionRepository) {}

  /**
   * @throws {InvalidCommandNameError | ReservedCommandNameError | DuplicateCommandNameError}
   */
  async execute(request: CreateCommandDefinitionRequest): Promise<CommandDefinition> {
    const name = normalizeCommandName(request.name);

    if (!COMMAND_NAME_PATTERN.test(name)) {
      throw new InvalidCommandNameError();
    }
    if (RESERVED_COMMAND_NAMES.includes(name)) {
      throw new ReservedCommandNameError(name);
    }

    const existing = await this.repo.getDefinitions();
    if (existing.some(d => d.name === name)) {
      throw new DuplicateCommandNameError(name);
    }

    const definition = createCommandDefinition({
      name,
      description: request.description,
      systemPrompt: request.systemPrompt,
      kind: "agent",
    });
    await this.repo.saveDefinition(definition);
    return definition;
  }
}
