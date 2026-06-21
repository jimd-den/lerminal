import { Card } from "../../entities/card";
import { Workspace } from "../../entities/workspace";
import { RESERVED_COMMAND_NAMES } from "../../entities/commandDefinition";
import { UnknownCommandError } from "../errors";
import { CommandContext, PipelineCommand } from "./Command";

/**
 * Settings/context shared by every stage of a pipeline run, supplied by the
 * presenter. `inputCards` seeds the first stage; later stages receive the cards
 * produced by the previous stage.
 */
export interface PipelineEnvironment {
  workspaceId: string;
  /** The group new cards are created under (null = workspace root / current view). */
  parentId: string | null;
  initialInputCards: Card[];
  workspaces: Workspace[];
  apiKey: string;
  model: string;
  systemPrompt: string;
  chunkSystemPrompt: string;
  /**
   * When true, a content-producing pipeline auto-organizes its output by composing
   * a trailing `group "<command>"` stage — keeping grouping a matter of command
   * composition rather than special-casing each command.
   */
  autoGroup: boolean;
  /**
   * Names of pipeline-macro commands already being expanded (for recursion guarding).
   * Top-level callers omit this; macro expansion threads it down.
   */
  expansionStack?: string[];
}

/** Commands whose fresh output is worth auto-grouping by command name. */
const AUTO_GROUP_PRODUCERS = new Set(["ask", "source", "chunk", "recall"]);

interface ParsedStage {
  cmd: string;
  arg: string;
}

/**
 * The outcome of running a whole pipeline — the runner's output boundary.
 * - `completed`: all stages ran; `cards` are the final stage's output.
 * - `needsInput` / `review`: a stage halted the pipeline for UI interaction.
 */
export type PipelineOutcome =
  | { kind: "completed"; cards: Card[] }
  | { kind: "needsInput"; mode: "ask" | "source"; command: string }
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
    const stages = this.withAutoGroup(this.parse(pipelineText), env.autoGroup);

    let cards = env.initialInputCards;

    for (const { cmd, arg } of stages) {
      const command = this.commands.get(cmd);
      if (!command) {
        throw new UnknownCommandError(cmd);
      }

      const ctx: CommandContext = {
        workspaceId: env.workspaceId,
        parentId: env.parentId,
        inputCards: cards,
        workspaces: env.workspaces,
        apiKey: env.apiKey,
        model: env.model,
        systemPrompt: env.systemPrompt,
        chunkSystemPrompt: env.chunkSystemPrompt,
        expansionStack: env.expansionStack ?? [],
      };

      const result = await command.execute(arg, ctx);
      if (result.kind === "needsInput") {
        return { kind: "needsInput", mode: result.mode, command: cmd };
      }
      if (result.kind === "review") {
        return { kind: "review" };
      }
      cards = result.kind === "cards" ? result.cards : [];
    }

    return { kind: "completed", cards };
  }

  private parse(pipelineText: string): ParsedStage[] {
    const stages: ParsedStage[] = [];
    for (const raw of pipelineText.split("|").map(s => s.trim()).filter(Boolean)) {
      const match = raw.match(/^([a-zA-Z0-9_-]+)\s*([\s\S]*)$/);
      if (!match) continue;
      stages.push({
        cmd: match[1].toLowerCase(),
        arg: match[2].trim().replace(/^["']|["']$/g, ""),
      });
    }
    return stages;
  }

  /**
   * Auto-grouping is implemented as pure composition: when enabled and the pipeline
   * ends in a content-producing command (and isn't already a grouping command), a
   * trailing `group "<command>"` stage is appended so the run's output is organized
   * under a group named after the command that produced it.
   */
  private withAutoGroup(stages: ParsedStage[], autoGroup: boolean): ParsedStage[] {
    if (!autoGroup || stages.length === 0) return stages;
    const last = stages[stages.length - 1];
    
    // Auto-group if it's a known producer OR if it's a custom command (which are always producers)
    const isCustomCommand = !RESERVED_COMMAND_NAMES.includes(last.cmd);
    if (!AUTO_GROUP_PRODUCERS.has(last.cmd) && !isCustomCommand) return stages;
    
    return [...stages, { cmd: "group", arg: last.cmd }];
  }
}
