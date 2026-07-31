import { Card } from "../../entities/card";
import { Workspace } from "../../entities/workspace";
import {
  AssistantProfile,
  AssistantCapability,
} from "../../entities/assistantProfile";
import { CardTypeDefinition } from "../../entities/cardTypeDefinition";
import { Logger, silentLogger } from "../ports/Logger";
import { UnknownCommandError } from "../errors";
import { CommandContext, PipelineCommand } from "./Command";

/**
 * Shared execution context supplied to each stage of a pipeline run.
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
  assistantProfiles?: AssistantProfile[];
  activeProfileIds?: Partial<Record<AssistantCapability, string>>;
  cardTypes?: CardTypeDefinition[];
  /** Controller-level output grouping preference. */
  autoGroup?: boolean;
  /**
   * Names of pipeline-macro commands already being expanded (for recursion guarding).
   */
  expansionStack?: string[];
}

interface ParsedStage {
  cmd: string;
  arg: string;
}

/**
 * Outcome of running a pipeline — the runner's output boundary.
 */
export type PipelineOutcome =
  | { kind: "completed"; cards: Card[] }
  | {
      kind: "needsInput";
      mode: "ask" | "source";
      command: string;
      resume?: {
        command: string;
        inputCards: Card[];
        remainingPipeline: string;
      };
    }
  | { kind: "review" }
  /** The pipeline hit `goal`; the presenter opens the Goal Architect. */
  | { kind: "goal" };

/**
 * # Pipeline Runner (Clean Architecture Application Use Case)
 *
 * ## Business Value & Purpose
 * Executes a Unix-like pipeline of transformations (e.g. `import <url> | ask "summarize" | group "Topic"`).
 * Threads AssistantProfiles into CommandContext so individual pipeline stages resolve goal-specific AI prompts.
 *
 * ## Applied Design Patterns
 * - **Pipeline / Chain of Responsibility Pattern**: Chains modular transform commands, threading output -> input.
 * - **Command Pattern**: Executes stages via the `PipelineCommand` interface abstraction.
 */
export class PipelineRunner {
  private readonly commands: Map<string, PipelineCommand>;
  private readonly logger: Logger;

  constructor(commands: PipelineCommand[], logger: Logger = silentLogger) {
    this.commands = new Map(commands.map((c) => [c.name, c]));
    this.logger = logger;
  }

  /**
   * Parses and executes a pipeline string sequentially.
   *
   * @param pipelineText e.g. `note "idea" | ask "expand" | group "Ideas"`.
   * @param env Execution environment containing workspace, parent group, and settings.
   */
  async run(
    pipelineText: string,
    env: PipelineEnvironment,
  ): Promise<PipelineOutcome> {
    const stages = this.parse(pipelineText);

    let cards = env.initialInputCards;

    for (let index = 0; index < stages.length; index += 1) {
      const { cmd, arg } = stages[index];
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
        assistantProfiles: env.assistantProfiles,
        activeProfileIds: env.activeProfileIds,
        cardTypes: env.cardTypes,
        expansionStack: env.expansionStack ?? [],
      };

      const result = await command.execute(arg, ctx);

      if (result.kind === "needsInput") {
        this.logger.debug("pipeline.halted", { reason: "needsInput", stage: cmd });
        const outerRemainder = stages
          .slice(index + 1)
          .map(formatPipelineStage)
          .join(" | ");
        const resume = result.resume ?? {
          command: cmd,
          inputCards: cards,
          remainingPipeline: "",
        };
        const remainingPipeline = [resume.remainingPipeline, outerRemainder]
          .filter(Boolean)
          .join(" | ");
        const needsContinuation = Boolean(
          remainingPipeline || resume.inputCards.length || result.resume,
        );
        return {
          kind: "needsInput",
          mode: result.mode,
          command: needsContinuation ? resume.command : cmd,
          ...(needsContinuation
            ? { resume: { ...resume, remainingPipeline } }
            : {}),
        };
      }
      if (result.kind === "review") {
        this.logger.debug("pipeline.halted", { reason: "review" });
        return { kind: "review" };
      }
      if (result.kind === "goal") {
        this.logger.debug("pipeline.halted", { reason: "goal" });
        return { kind: "goal" };
      }
      cards = result.kind === "cards" ? result.cards : [];
    }

    this.logger.debug("pipeline.completed", { outputCards: cards.length });

    return { kind: "completed", cards };
  }

  private parse(pipelineText: string): ParsedStage[] {
    const stages: ParsedStage[] = [];
    for (const raw of splitPipelineStages(pipelineText)) {
      const match = raw.match(/^([a-zA-Z0-9_-]+)\s*([\s\S]*)$/);
      if (!match) continue;
      const rawArg = match[2].trim();
      stages.push({
        cmd: match[1].toLowerCase(),
        arg: unquotePipelineArg(rawArg),
      });
    }
    return stages;
  }
}

function formatPipelineStage(stage: ParsedStage): string {
  if (!stage.arg) return stage.cmd;
  return `${stage.cmd} "${stage.arg.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function splitPipelineStages(input: string): string[] {
  const stages: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = quote === char ? null : (quote ?? char);
      current += char;
      continue;
    }
    if (char === "|" && !quote) {
      if (current.trim()) stages.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) stages.push(current.trim());
  return stages;
}

function unquotePipelineArg(arg: string): string {
  const quote = arg[0];
  const quoted =
    (quote === '"' || quote === "'") && arg[arg.length - 1] === quote;
  const value = quoted ? arg.slice(1, -1) : arg;
  return value.replace(/\\([\\"'])/g, "$1");
}
