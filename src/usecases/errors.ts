/**
 * # Use Case Error Types
 *
 * ## Business Value & Purpose
 * Use cases must be able to reject invalid requests without knowing how the failure
 * is shown to the user. These typed domain errors carry a `userMessage` that the
 * presenter (controller) maps to a toast, keeping user-facing copy out of the
 * orchestration logic and giving callers a stable contract to branch on.
 */

/**
 * Base class for all expected, user-recoverable use case failures.
 * `userMessage` is safe to surface directly to the user.
 */
export class UseCaseError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string, technicalMessage?: string) {
    super(technicalMessage || userMessage);
    this.name = new.target.name;
    this.userMessage = userMessage;
    // Restore prototype chain for instanceof across transpilation targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Raised when an action requires an active workspace but none is selected. */
export class NoActiveWorkspaceError extends UseCaseError {
  constructor() {
    super("Create a workspace first");
  }
}

/**
 * Raised when a command needs input cards of a particular kind but the current
 * selection contains none.
 */
export class EmptySelectionError extends UseCaseError {
  constructor(userMessage: string) {
    super(userMessage);
  }
}

/** Raised when a target workspace (e.g. for `move`) cannot be resolved. */
export class WorkspaceNotFoundError extends UseCaseError {
  constructor() {
    super("Target workspace not found");
  }
}

/** Raised when a command is missing a required argument. */
export class MissingArgumentError extends UseCaseError {
  constructor(userMessage: string) {
    super(userMessage);
  }
}

/** Raised when an unknown pipeline command name is encountered. */
export class UnknownCommandError extends UseCaseError {
  constructor(cmd: string) {
    super(`Unknown command: ${cmd}`);
  }
}

/** Raised when the agent gateway fails to produce cards. */
export class AgentRequestError extends UseCaseError {
  constructor(technicalMessage?: string) {
    super("Agent request failed", technicalMessage);
  }
}

/** Raised when starting a review but nothing is due/scheduled. */
export class NothingDueError extends UseCaseError {
  constructor() {
    super("Nothing due. Run space on questions first.");
  }
}
