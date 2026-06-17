import { CommandDefinition } from "../../entities/commandDefinition";
import { AgentGateway } from "../../adapters/gateways/AgentGateway";
import { CardRepository } from "../../adapters/repositories/CardRepository";
import { CustomAgentCommand } from "./CustomAgentCommand";
import { PipelineCommand } from "./Command";

/**
 * The ports a custom command might need. New command kinds add their own ports
 * here (e.g. a `wikipediaGateway`) without disturbing existing kinds.
 */
export interface CommandFactoryDeps {
  agentGateway: AgentGateway;
  cardRepo: CardRepository;
}

/**
 * # Command Factory
 *
 * ## Business Value & Purpose
 * Turns a persisted {@link CommandDefinition} into a runnable {@link PipelineCommand}.
 * This is the single extension point for custom commands: supporting a new source
 * (say, Wikipedia) means adding one `case` here plus its definition fields and
 * gateway — the pipeline, runner, and presenter stay untouched.
 */
export function createPipelineCommand(
  definition: CommandDefinition,
  deps: CommandFactoryDeps
): PipelineCommand {
  switch (definition.kind) {
    case "agent":
      return new CustomAgentCommand(definition, deps.agentGateway, deps.cardRepo);
    default: {
      // Exhaustiveness guard: a new CommandKind must be handled above.
      const unhandled: never = definition.kind;
      throw new Error(`Unsupported command kind: ${unhandled}`);
    }
  }
}
