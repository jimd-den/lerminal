import {
  CommandDefinition,
  CommandKind,
  COMMAND_NAME_PATTERN,
  createCommandDefinition,
  normalizeCommandName,
  RESERVED_COMMAND_NAMES,
} from "../../entities/commandDefinition";
import { CommandDefinitionRepository } from "../../adapters/repositories/CommandDefinitionRepository";
import {
  DuplicateCommandNameError,
  InvalidCommandNameError,
  MissingArgumentError,
  ReservedCommandNameError,
} from "../errors";

/**
 * Inputs for defining a custom command. `kind` selects the behavior:
 * - `agent` (default): provide `systemPrompt`.
 * - `pipeline`: provide `body` (the pipeline string to expand into).
 */
export interface CreateCommandDefinitionRequest {
  name: string;
  description?: string;
  kind?: CommandKind;
  systemPrompt?: string;
  body?: string;
}

/**
 * # Create Command Definition Interactor
 *
 * ## Business Value & Purpose
 * Validates and persists a new custom command (agent or pipeline macro). A command
 * name must be a single lowercase token, must not shadow a built-in, and must be
 * unique among the user's commands — guarantees the pipeline parser and palette rely
 * on. The kind-specific payload (prompt or pipeline body) must be non-empty.
 */
export class CreateCommandDefinitionInteractor {
  constructor(private readonly repo: CommandDefinitionRepository) {}

  /**
   * @throws {InvalidCommandNameError | ReservedCommandNameError | DuplicateCommandNameError | MissingArgumentError}
   */
  async execute(request: CreateCommandDefinitionRequest): Promise<CommandDefinition> {
    const name = normalizeCommandName(request.name);
    const kind: CommandKind = request.kind || "agent";

    if (!COMMAND_NAME_PATTERN.test(name)) {
      throw new InvalidCommandNameError();
    }
    if (RESERVED_COMMAND_NAMES.includes(name)) {
      throw new ReservedCommandNameError(name);
    }

    if (kind === "agent" && !request.systemPrompt?.trim()) {
      throw new MissingArgumentError("Add a system prompt for this command");
    }
    if (kind === "pipeline" && !request.body?.trim()) {
      throw new MissingArgumentError("Add a pipeline for this command (e.g. chunk | recall | space)");
    }

    const existing = await this.repo.getDefinitions();
    if (existing.some(d => d.name === name)) {
      throw new DuplicateCommandNameError(name);
    }

    const definition = createCommandDefinition({
      name,
      description: request.description,
      kind,
      systemPrompt: request.systemPrompt,
      body: request.body,
    });
    await this.repo.saveDefinition(definition);
    return definition;
  }
}
