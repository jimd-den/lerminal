import { CommandDefinition } from "../../entities/commandDefinition";
import { AgentGateway } from "../../adapters/gateways/AgentGateway";
import { CardRepository } from "../../adapters/repositories/CardRepository";
import { CustomAgentCommand } from "./CustomAgentCommand";
import { PipelineMacroCommand } from "./PipelineMacroCommand";
import { PipelineCommand } from "./Command";
import type { PipelineRunner } from "./PipelineRunner";

/**
 * The ports a custom command might need. New command kinds add their own ports
 * here (e.g. a `wikipediaGateway`) without disturbing existing kinds.
 */
export interface CommandFactoryDeps {
  agentGateway: AgentGateway;
  cardRepo: CardRepository;
  /**
   * Lazily resolves the runner that pipeline-macro commands expand into. A thunk so
   * the macro always uses the latest command set (the runner is rebuilt on change).
   */
  getRunner: () => PipelineRunner;
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
    case "pipeline":
      return new PipelineMacroCommand(definition, deps.getRunner);
    default: {
      // Exhaustiveness guard: a new CommandKind must be handled above.
      const unhandled: never = definition;
      throw new Error(`Unsupported command kind: ${JSON.stringify(unhandled)}`);
    }
  }
}
