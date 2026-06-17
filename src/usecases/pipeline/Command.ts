import { Card } from "../../entities/card";
import { Workspace } from "../../entities/workspace";

/**
 * # Pipeline Command Port & Output Boundary
 *
 * ## Business Value & Purpose
 * Learnimal pipelines (`ask "X" | chunk | recall | space`) are sequences of
 * single-responsibility commands. This module defines the contract every command
 * implements and the typed result it returns. By making the result an explicit
 * output boundary (instead of returning `null` to signal a halt or calling a UI
 * toast directly), the runner and the presenter can interpret outcomes without the
 * command knowing anything about the UI.
 */

/**
 * Everything a command needs to run, resolved from controller state for the
 * current pipeline stage.
 */
export interface CommandContext {
  /** The active workspace cards are created in / resolved from. */
  workspaceId: string;
  /** Cards piped in from the previous stage (or the current selection). */
  inputCards: Card[];
  /** All workspaces, used by commands such as `move` that target another scope. */
  workspaces: Workspace[];
  /** OpenRouter API key for agent-backed commands. */
  apiKey: string;
  /** Selected model identifier for agent-backed commands. */
  model: string;
  /** System prompt for agent-backed commands. */
  systemPrompt: string;
}

/**
 * The typed outcome of running a command — the pipeline's output boundary.
 * - `cards`: the command produced/selected cards; they flow to the next stage as
 *   its input (and the final stage's cards become the new selection).
 * - `needsInput`: the command requires user entry; the pipeline halts and the
 *   presenter opens the matching input sheet.
 * - `review`: the command requests the review session be opened; pipeline halts.
 * - `noop`: the command completed with no cards to pass downstream.
 */
export type CommandResult =
  | { kind: "cards"; cards: Card[] }
  | { kind: "needsInput"; mode: "ask" | "source" }
  | { kind: "review" }
  | { kind: "noop" };

/**
 * A single pipeline command. Implementations depend only on the ports they need
 * (repositories, gateways) via constructor injection and throw {@link UseCaseError}
 * subclasses for expected, user-recoverable failures.
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
