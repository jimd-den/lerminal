import { Card } from "../../entities/card";
import { Workspace } from "../../entities/workspace";
import {
  AssistantProfile,
  AssistantCapability,
} from "../../entities/assistantProfile";
import { CardTypeDefinition } from "../../entities/cardTypeDefinition";
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
  | { kind: "review" };

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

  constructor(commands: PipelineCommand[]) {
    this.commands = new Map(commands.map((c) => [c.name, c]));
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
    const logTimestamp = new Date().toISOString();
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
        console.log(
          `[${logTimestamp}] [PipelineRunner.run] Pipeline halted for user input | stage=${cmd}`,
        );
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
        console.log(
          `[${logTimestamp}] [PipelineRunner.run] Pipeline halted for review session`,
        );
        return { kind: "review" };
      }
      cards = result.kind === "cards" ? result.cards : [];
    }

    console.log(
      `[${logTimestamp}] [PipelineRunner.run] Pipeline completed | outputCardCount=${cards.length}`,
    );

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
