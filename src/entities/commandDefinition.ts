/**
 * # Command Definition Entity
 *
 * ## Business Value & Purpose
 * GRIOT's power comes from composable, Unix-style commands. This entity lets a
 * user define their *own* commands that slot into pipelines alongside the built-ins
 * — for example a command that asks the agent with a specialized prompt.
 *
 * ## Extensibility
 * `kind` is a discriminator so new command sources can be added without touching the
 * pipeline. Today the only kinds are `"agent"` (runs the agent with a custom prompt) and
 * `"pipeline"` (expands into a saved pipeline string). Guided/research/hybrid command
 * kinds are deliberately *not* declared here yet: a discriminated-union variant nothing
 * can create or run is dead weight, not a type-level promise — they arrive together with
 * the Command Workshop that gives them an execution path.
 */

import { SemanticRole } from "./card";

/** The source a custom command draws its cards from. */
export type CommandKind = "agent" | "pipeline";

/**
 * Who a command belongs to and where it's visible.
 *
 * Mirrors `ProfileScope` on `AssistantProfile` — the same three-way split, for the same
 * reason: `workspace`-scoped commands must not appear in an unrelated workspace, and
 * `session`-scoped ones (never persisted — see the repository layer) vanish on restart by
 * construction. Absent means `"global"`, every command's behavior before this existed.
 */
export type CommandScope = "session" | "workspace" | "global";

interface BaseCommandDefinition {
  /** Unique identifier. */
  id: string;
  /** The keyword typed in a pipeline (lowercase, no spaces). */
  name: string;
  /** Human-friendly description shown in the palette. */
  description: string;
  /** Epoch timestamp of creation. */
  createdAt: number;
  /** Undefined means `"global"` — every command's behavior before this field existed. */
  scope?: CommandScope;
  /** Required when `scope === "workspace"`; ignored otherwise. */
  workspaceId?: string;
  /**
   * Declared, not inferred: whether running this command may reach the network. An
   * agent-kind command that calls a model is *not* automatically web use — this is
   * specifically about search/fetch, which no command kind performs today. Exists so a
   * future kind that does can declare it truthfully rather than the app having to guess.
   */
  webUse?: boolean;
  /** What kind of card this command expects as input, when it's meaningful to state. */
  requiredInputRoles?: SemanticRole[];
  requiredInputCount?: "none" | "one-or-more";
  /** What kind of card this command tends to produce, when it's meaningful to state. */
  outputRoles?: SemanticRole[];
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
  "note",
  "split",
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
  scope?: CommandScope;
  workspaceId?: string;
  webUse?: boolean;
  requiredInputRoles?: SemanticRole[];
  requiredInputCount?: "none" | "one-or-more";
  outputRoles?: SemanticRole[];
}

/**
 * Factory for a valid {@link CommandDefinition}. Normalizes the name and builds the
 * shape for the requested `kind`; callers are responsible for validating uniqueness /
 * reserved words / required fields (see the create interactor).
 */
export function createCommandDefinition(params: CreateCommandDefinitionParams): CommandDefinition {
  const base = {
    id: params.id || Math.random().toString(36).substring(2, 10),
    name: normalizeCommandName(params.name),
    createdAt: params.createdAt || Date.now(),
    scope: params.scope,
    workspaceId: params.workspaceId,
    webUse: params.webUse,
    requiredInputRoles: params.requiredInputRoles,
    requiredInputCount: params.requiredInputCount,
    outputRoles: params.outputRoles,
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

  return definition;
}

/** A command's scope, defaulted to `"global"` — every command's behavior before this field existed. */
export function resolveCommandScope(definition: CommandDefinition): CommandScope {
  return definition.scope ?? "global";
}

/**
 * Whether a command should be usable from the given workspace.
 *
 * Global and session-scoped commands are visible everywhere (session-scoped ones are
 * simply never persisted past the session, which is what actually bounds them — see the
 * repository layer). A workspace-scoped command is visible only in the workspace it
 * belongs to, the isolation the custom-command system otherwise has no way to express.
 */
export function isCommandVisibleInWorkspace(
  definition: CommandDefinition,
  activeWorkspaceId: string | null | undefined
): boolean {
  if (resolveCommandScope(definition) !== "workspace") return true;
  return definition.workspaceId === activeWorkspaceId;
}
