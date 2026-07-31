/**
 * # FSRS Space Configuration Model
 *
 * ## Business Value & Rationale
 * Desired retention is a space-level preference: an exam prep space might target 0.95,
 * while a casual reading space may prefer 0.85 to reduce daily review workload.
 * ChunkBuddy attaches FSRS-5 settings directly to the workspace/study space entity.
 */
export interface FsrsConfig {
  /** Target probability of successful recall when a card becomes due (e.g. 0.85 to 0.95). Default is 0.90. */
  desiredRetention: number;
  /** Hard upper limit for review intervals in days. Default is 36500 (approx. 100 years). */
  maximumIntervalDays: number;
  /** Minute steps for learning new cards before entering the main review loop. Default is [1, 10]. */
  learningStepsMinutes: number[];
  /** Minute steps for relearning lapsed cards after a failed recall ('again'). Default is [10]. */
  relearningStepsMinutes: number[];
  /** Enables interval fuzzing to prevent review clustering on identical dates. Default is true. */
  enableFuzz: boolean;
  /** Version identifier for scheduler parameters. */
  schedulerVersion: "fsrs-5";
}

/** Default FSRS-5 parameters for new study spaces. */
export const DEFAULT_FSRS_CONFIG: FsrsConfig = {
  desiredRetention: 0.9,
  maximumIntervalDays: 36500,
  learningStepsMinutes: [1, 10],
  relearningStepsMinutes: [10],
  enableFuzz: true,
  schedulerVersion: "fsrs-5",
};

/**
 * Coarse status of a workspace's mission, shown in the Mission Control module (Phase 4).
 * Purely descriptive — it never gates which commands are available.
 */
export type WorkspacePhase = "define" | "explore" | "build" | "review" | "done";

/**
 * # Workspace Mission (Goal / Capstone) Model
 *
 * ## Business Value & Purpose
 * Turns a workspace from an undifferentiated card bucket into a goal-directed space: what
 * the learner is trying to achieve, why, and what "done" looks like. Optional and additive —
 * a workspace with no mission behaves exactly as it does today (see `Workspace.mission?`).
 */
export interface WorkspaceMission {
  goalTitle: string;
  goalDescription: string;
  successCriteria: string[];
  targetDeliverable: string;
  currentPhase: WorkspacePhase;
  createdAt: number;
  updatedAt: number;
}

export interface CreateWorkspaceMissionParams {
  goalTitle: string;
  goalDescription?: string;
  successCriteria?: string[];
  targetDeliverable?: string;
  currentPhase?: WorkspacePhase;
  createdAt?: number;
  updatedAt?: number;
}

/** Factory for a valid {@link WorkspaceMission}. */
export function createWorkspaceMission(params: CreateWorkspaceMissionParams): WorkspaceMission {
  const now = Date.now();
  return {
    goalTitle: params.goalTitle.trim(),
    goalDescription: (params.goalDescription ?? "").trim(),
    successCriteria: params.successCriteria ?? [],
    targetDeliverable: (params.targetDeliverable ?? "").trim(),
    currentPhase: params.currentPhase ?? "define",
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  };
}

/** Returns an updated mission with `updatedAt` refreshed, without mutating the input. */
export function updateWorkspaceMission(
  mission: WorkspaceMission,
  changes: Partial<Omit<WorkspaceMission, "createdAt" | "updatedAt">>
): WorkspaceMission {
  return {
    ...mission,
    ...changes,
    updatedAt: Date.now(),
  };
}

/**
 * # Workspace / Study Space Entity Domain Model
 *
 * ## Business Value & Purpose
 * A Workspace defines a bounded study space for learning a specific subject (e.g., "WebGPU Rendering").
 * It owns notes, sources, and study cards, configures the FSRS review parameters for cards within it,
 * and may optionally carry a {@link WorkspaceMission} describing the goal it's organized around.
 */
export interface Workspace {
  /** Unique identifier for the workspace. */
  id: string;
  /** The name of the workspace / study space. Enforces display truncation. */
  name: string;
  /** Epoch timestamp of workspace creation. */
  createdAt: number;
  /** Space-level FSRS scheduler settings. */
  fsrsConfig: FsrsConfig;
  /** Optional goal/capstone this workspace is organized around. Absent = no mission set. */
  mission?: WorkspaceMission;
}

export interface CreateWorkspaceParams {
  id?: string;
  name: string;
  createdAt?: number;
  fsrsConfig?: FsrsConfig;
  mission?: WorkspaceMission;
}

/**
 * Factory function to instantiate a valid Workspace entity.
 * Automatically enforces a maximum name length of 22 characters for clean UI styling.
 *
 * @param params Construction parameters for the workspace.
 * @returns A fully initialized Workspace entity with FSRS settings.
 */
export function createWorkspace(params: CreateWorkspaceParams): Workspace {

  const generatedId = params.id || Math.random().toString(36).substring(2, 10);
  const createdTime = params.createdAt || Date.now();

  const trimmedName = params.name.trim();
  const displayName = trimmedName.length > 22
    ? trimmedName.substring(0, 22) + "…"
    : trimmedName;

  const fsrsConfig: FsrsConfig = params.fsrsConfig || { ...DEFAULT_FSRS_CONFIG };

  const workspace: Workspace = {
    id: generatedId,
    name: displayName,
    createdAt: createdTime,
    fsrsConfig,
    mission: params.mission,
  };

  return workspace;
}
