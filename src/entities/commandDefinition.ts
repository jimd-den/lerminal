/**
 * # Command Definition Entity
 *
 * ## Business Value & Purpose
 * Learnimal's power comes from composable, Unix-style commands. This entity lets a
 * user define their *own* commands that slot into pipelines alongside the built-ins
 * — for example a command that asks the agent with a specialized prompt.
 *
 * ## Extensibility
 * `kind` is a discriminator so new command sources can be added without touching the
 * pipeline. Today the only kind is `"agent"` (runs the agent with a custom prompt);
 * a future `"wikipedia"` kind would add its own fields (e.g. a language) and a
 * matching branch in the command factory — nothing else changes.
 */

/** The source a custom command draws its cards from. */
export type CommandKind = "agent" | "pipeline";

interface BaseCommandDefinition {
  /** Unique identifier. */
  id: string;
  /** The keyword typed in a pipeline (lowercase, no spaces). */
  name: string;
  /** Human-friendly description shown in the palette. */
  description: string;
  /** Epoch timestamp of creation. */
  createdAt: number;
}

/** A custom command that queries the agent with a user-supplied system prompt. */
export interface AgentCommandDefinition extends BaseCommandDefinition {
  kind: "agent";
  /** The system prompt the agent runs with for this command. */
  systemPrompt: string;
}

/**
 * A custom command that expands into a saved pipeline string — a Unix-style macro.
 * Running it executes `body` as a sub-pipeline. The token `$1` (or `$ARG`) inside
 * `body` is replaced with the quoted argument the macro is invoked with, letting a
 * macro take a topic (e.g. `learn "$1"` -> `ask "$1" | chunk | recall | space`).
 */
export interface PipelineCommandDefinition extends BaseCommandDefinition {
  kind: "pipeline";
  /** The pipeline string this command expands into (e.g. `source | chunk | recall`). */
  body: string;
}

/** Discriminated union of all custom command kinds (extend as kinds are added). */
export type CommandDefinition = AgentCommandDefinition | PipelineCommandDefinition;

/**
 * Built-in command keywords that custom commands may not shadow. Kept here so both
 * the entity layer and validation share one source of truth.
 */
export const RESERVED_COMMAND_NAMES: readonly string[] = [
  "ask",
  "source",
  "chunk",
  "recall",
  "space",
  "review",
  "move",
  "group",
  "ungroup",
  "delete",
  "search",
  "cloze",
  "elaborate",
];

/** A command name must be a single lowercase token (letters, digits, hyphens). */
export const COMMAND_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Normalizes a user-entered command name to its canonical pipeline form. */
export function normalizeCommandName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

export interface CreateCommandDefinitionParams {
  id?: string;
  name: string;
  description?: string;
  kind?: CommandKind;
  /** Required for `agent` kind: the system prompt. */
  systemPrompt?: string;
  /** Required for `pipeline` kind: the pipeline string to expand into. */
  body?: string;
  createdAt?: number;
}

/**
 * Factory for a valid {@link CommandDefinition}. Normalizes the name and builds the
 * shape for the requested `kind`; callers are responsible for validating uniqueness /
 * reserved words / required fields (see the create interactor).
 */
export function createCommandDefinition(params: CreateCommandDefinitionParams): CommandDefinition {
  const logTimestamp = new Date().toISOString();
  const base = {
    id: params.id || Math.random().toString(36).substring(2, 10),
    name: normalizeCommandName(params.name),
    createdAt: params.createdAt || Date.now(),
  };

  const definition: CommandDefinition =
    params.kind === "pipeline"
      ? {
          ...base,
          kind: "pipeline",
          description: params.description?.trim() || "Custom pipeline macro",
          body: params.body || "",
        }
      : {
          ...base,
          kind: "agent",
          description: params.description?.trim() || "Custom agent command",
          systemPrompt: params.systemPrompt || "",
        };

  console.log(`[${logTimestamp}] [createCommandDefinition] OUTPUT: ${JSON.stringify({ ...definition, kind: definition.kind })}`);
  return definition;
}
