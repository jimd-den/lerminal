import { Card } from "../../entities/card";
import { Workspace } from "../../entities/workspace";
import {
  AssistantProfile,
  AssistantCapability,
} from "../../entities/assistantProfile";
import { CardTypeDefinition } from "../../entities/cardTypeDefinition";

/**
 * # Pipeline Command Port & Output Boundary
 *
 * ## Business Value & Purpose
 * Learnimal pipelines (`ask "X" | chunk | recall | space`) are sequences of
 * single-responsibility commands. This module defines the contract every command
 * implements and the typed result it returns.
 */

/**
 * Everything a command needs to run, resolved from controller state for the
 * current pipeline stage.
 */
export interface CommandContext {
  /** The active workspace cards are created in / resolved from. */
  workspaceId: string;
  /** The group new cards are created under (null = workspace root / current view). */
  parentId: string | null;
  /** Cards piped in from the previous stage (or the current selection). */
  inputCards: Card[];
  /** All workspaces, used by commands such as `move` that target another scope. */
  workspaces: Workspace[];
  /** OpenRouter API key for agent-backed commands. */
  apiKey: string;
  /** Selected model identifier for agent-backed commands. */
  model: string;
  /** System prompt for agent-backed commands (legacy fallback). */
  systemPrompt: string;
  /** System prompt for chunking commands (legacy fallback). */
  chunkSystemPrompt: string;
  /** AI Assistance Profiles for goal-specific assistance. */
  assistantProfiles?: AssistantProfile[];
  /** Active profile ID mappings per capability. */
  activeProfileIds?: Partial<Record<AssistantCapability, string>>;
  /** Active built-in and custom card-type registry. */
  cardTypes?: CardTypeDefinition[];
  /**
   * Names of pipeline-macro commands currently being expanded, outermost first.
   * Threaded so a {@link PipelineCommandDefinition} can detect and reject recursion.
   */
  expansionStack: string[];
}

/**
 * The typed outcome of running a command — the pipeline's output boundary.
 */
export type CommandResult =
  | { kind: "cards"; cards: Card[] }
  | {
      kind: "needsInput";
      mode: "ask" | "source";
      resume?: {
        command: string;
        inputCards: Card[];
        remainingPipeline: string;
      };
    }
  | { kind: "review" }
  /** Open the Goal Architect. Like `review`, ends the pipeline and creates nothing. */
  | { kind: "goal" }
  | { kind: "noop" };

/**
 * A single pipeline command. Implementations depend only on the ports they need
 * via constructor injection.
 */
export interface PipelineCommand {
  /** The lowercase command keyword as typed in a pipeline (e.g. "chunk"). */
  readonly name: string;
  /**
   * Executes the command.
   *
   * @param arg The unquoted argument following the command keyword, if any.
   * @param ctx The resolved execution context for this stage.
   */
  execute(arg: string, ctx: CommandContext): Promise<CommandResult>;
}
