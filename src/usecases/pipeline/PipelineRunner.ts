import { Card } from "../../entities/card";
import { Workspace } from "../../entities/workspace";
import { UnknownCommandError } from "../errors";
import { CommandContext, PipelineCommand } from "./Command";

/**
 * Settings/context shared by every stage of a pipeline run, supplied by the
 * presenter. `inputCards` seeds the first stage; later stages receive the cards
 * produced by the previous stage.
 */
export interface PipelineEnvironment {
  workspaceId: string;
  initialInputCards: Card[];
  workspaces: Workspace[];
  apiKey: string;
  model: string;
  systemPrompt: string;
}

/**
 * The outcome of running a whole pipeline — the runner's output boundary.
 * - `completed`: all stages ran; `cards` are the final stage's output.
 * - `needsInput` / `review`: a stage halted the pipeline for UI interaction.
 */
export type PipelineOutcome =
  | { kind: "completed"; cards: Card[] }
  | { kind: "needsInput"; mode: "ask" | "source" }
  | { kind: "review" };

/**
 * # Pipeline Runner
 *
 * ## Business Value & Purpose
 * Executes a Unix-like pipeline (`ask "X" | chunk | recall | space`) by dispatching
 * each stage to its registered {@link PipelineCommand} and threading the cards
 * produced by one stage in as the input of the next. The runner owns parsing and
 * sequencing only; all domain work lives in the individual commands.
 */
export class PipelineRunner {
  private readonly commands: Map<string, PipelineCommand>;

  constructor(commands: PipelineCommand[]) {
    this.commands = new Map(commands.map(c => [c.name, c]));
  }

  /**
   * Parses and runs the pipeline.
   *
   * @param pipelineText e.g. `ask "React hooks" | chunk | recall`.
   * @param env Shared execution context for the run.
   * @throws {UseCaseError} when a stage rejects the request (the presenter maps it
   *   to user feedback).
   */
  async run(pipelineText: string, env: PipelineEnvironment): Promise<PipelineOutcome> {
    const stages = pipelineText
      .split("|")
      .map(s => s.trim())
      .filter(Boolean);

    let cards = env.initialInputCards;

    for (const stage of stages) {
      const match = stage.match(/^(\w+)\s*(.*)$/);
      if (!match) continue;

      const cmd = match[1].toLowerCase();
      const arg = match[2].trim().replace(/^["']|["']$/g, "");

      const command = this.commands.get(cmd);
      if (!command) {
        throw new UnknownCommandError(cmd);
      }

      const ctx: CommandContext = {
        workspaceId: env.workspaceId,
        inputCards: cards,
        workspaces: env.workspaces,
        apiKey: env.apiKey,
        model: env.model,
        systemPrompt: env.systemPrompt,
      };

      const result = await command.execute(arg, ctx);
      if (result.kind === "needsInput") {
        return { kind: "needsInput", mode: result.mode };
      }
      if (result.kind === "review") {
        return { kind: "review" };
      }
      cards = result.kind === "cards" ? result.cards : [];
    }

    return { kind: "completed", cards };
  }
}
