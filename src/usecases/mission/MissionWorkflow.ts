import { Card } from "../../entities/card";
import {
  createWorkspaceMission,
  updateWorkspaceMission,
  Workspace,
  WorkspacePhase,
} from "../../entities/workspace";
import { UseCaseError } from "../errors";
import { WorkspaceRepository } from "../ports/repositories/WorkspaceRepository";
import { GapReport, GapReportInteractor, summarizeGapReportForPrompt } from "../report/GapReportInteractor";
import { GenerateSyllabusInteractor } from "../agent/GenerateSyllabusInteractor";

/**
 * # Mission Workflow
 *
 * ## Business Value & Purpose
 * Mission Control is the part of the app that answers "what am I actually trying to
 * achieve, and how far off am I?". It groups the mission draft/editor, the deterministic
 * gap report, and the one explicit model call that turns a mission into a syllabus.
 *
 * Grouping them here keeps a promise that was easy to lose inside a large controller:
 * the gap report is computed, never generated — it needs no API key and cannot be
 * influenced by a model — while syllabus generation is the single clearly-marked place
 * that does call one.
 */

/** The editable form behind Mission Control. */
export interface MissionDraft {
  goalTitle: string;
  goalDescription: string;
  successCriteria: string[];
  targetDeliverable: string;
}

export const EMPTY_MISSION_DRAFT: MissionDraft = {
  goalTitle: "",
  goalDescription: "",
  successCriteria: [],
  targetDeliverable: "",
};

export interface MissionState {
  draft: MissionDraft;
  isEditorOpen: boolean;
  isGapReportOpen: boolean;
}

/** What a syllabus run produced, for the app to turn into a receipt. */
export interface SyllabusOutcome {
  group: Card;
  items: Card[];
  workspaceId: string;
}

export interface MissionHost {
  activeWorkspace(): Workspace | undefined;
  /** The cards the gap report reasons over. */
  cards(): Card[];
  apiKey(): string;
  model(): string;
  onChange(): void;
  notify(message: string): void;
  /** A workspace was persisted; refresh the app's copy. */
  onWorkspaceSaved(workspace: Workspace): void;
  /** Hand the user's report to the status-report preflight, pre-filled. */
  openStatusReportPreflight(prompt: string): void;
  onSyllabusCreated(outcome: SyllabusOutcome): Promise<void>;
  /** Long-running work the activity indicator should show. Returns an operation id. */
  beginOperation(label: string): string;
  endOperation(operationId: string): void;
  failOperation(operationId: string, message: string): void;
}

export interface MissionWorkflowDeps {
  workspaceRepo: WorkspaceRepository;
  gapReport: GapReportInteractor;
  generateSyllabus: GenerateSyllabusInteractor;
  host: MissionHost;
}

const messageFor = (error: unknown, fallback: string): string =>
  error instanceof UseCaseError ? error.userMessage : fallback;

/** Reads a workspace's mission back out as an editable draft. */
const draftFrom = (workspace: Workspace | undefined): MissionDraft => {
  const mission = workspace?.mission;
  if (!mission) return { ...EMPTY_MISSION_DRAFT };
  return {
    goalTitle: mission.goalTitle,
    goalDescription: mission.goalDescription,
    successCriteria: [...mission.successCriteria],
    targetDeliverable: mission.targetDeliverable,
  };
};

export class MissionWorkflow {
  private current: MissionState = {
    draft: { ...EMPTY_MISSION_DRAFT },
    isEditorOpen: false,
    isGapReportOpen: false,
  };

  constructor(private readonly deps: MissionWorkflowDeps) {}

  get state(): MissionState {
    return this.current;
  }

  private patch(changes: Partial<MissionState>): void {
    this.current = { ...this.current, ...changes };
    this.deps.host.onChange();
  }

  private patchDraft(changes: Partial<MissionDraft>): void {
    this.patch({ draft: { ...this.current.draft, ...changes } });
  }

  // --- Gap report: deterministic, model-free, computed fresh every time ---

  /** Never cached: the report is a view of current cards, not a stored artifact. */
  computeGapReport(): GapReport | null {
    const workspace = this.deps.host.activeWorkspace();
    if (!workspace) return null;
    return this.deps.gapReport.execute(workspace, this.deps.host.cards());
  }

  openGapReport(): void {
    this.patch({ isGapReportOpen: true });
  }

  closeGapReport(): void {
    this.patch({ isGapReportOpen: false });
  }

  /**
   * Closes the report and opens the status-report preflight pre-filled with the current
   * findings — the UI never has to know how that prompt is built.
   */
  enrichGapReport(): void {
    const report = this.computeGapReport();
    if (!report) return;
    this.patch({ isGapReportOpen: false });
    this.deps.host.openStatusReportPreflight(summarizeGapReportForPrompt(report));
  }

  // --- Mission editor ---

  openEditor(): void {
    this.patch({
      draft: draftFrom(this.deps.host.activeWorkspace()),
      isEditorOpen: true,
    });
  }

  closeEditor(): void {
    this.patch({ isEditorOpen: false });
  }

  updateDraft(patch: Partial<MissionDraft>): void {
    this.patchDraft(patch);
  }

  addCriterion(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.patchDraft({ successCriteria: [...this.current.draft.successCriteria, trimmed] });
  }

  removeCriterion(index: number): void {
    this.patchDraft({
      successCriteria: this.current.draft.successCriteria.filter((_, i) => i !== index),
    });
  }

  /** Persists the draft onto the active workspace. A mission needs a goal to be a mission. */
  async saveDraft(): Promise<void> {
    const workspace = this.deps.host.activeWorkspace();
    if (!workspace) return;

    const draft = this.current.draft;
    if (!draft.goalTitle.trim()) {
      this.deps.host.notify("Give the mission a goal title first");
      return;
    }

    const fields = {
      goalTitle: draft.goalTitle,
      goalDescription: draft.goalDescription,
      successCriteria: draft.successCriteria,
      targetDeliverable: draft.targetDeliverable,
    };
    const mission = workspace.mission
      ? updateWorkspaceMission(workspace.mission, fields)
      : createWorkspaceMission(fields);

    await this.persist({ ...workspace, mission });
    this.patch({ isEditorOpen: false });
    this.deps.host.notify(`Mission saved: ${mission.goalTitle}`);
  }

  /**
   * Moves the mission to another phase. Phases are freely switchable in both directions —
   * they describe where the user is, they never gate what they can do.
   */
  async setPhase(phase: WorkspacePhase): Promise<void> {
    const workspace = this.deps.host.activeWorkspace();
    if (!workspace?.mission) return;
    await this.persist({
      ...workspace,
      mission: updateWorkspaceMission(workspace.mission, { currentPhase: phase }),
    });
    this.deps.host.onChange();
  }

  private async persist(workspace: Workspace): Promise<void> {
    await this.deps.workspaceRepo.saveWorkspace(workspace);
    this.deps.host.onWorkspaceSaved(workspace);
  }

  /**
   * One explicit model call turning the mission into a persisted mini-syllabus of ordered
   * prerequisite cards. Both preconditions fail loudly rather than producing a vague or
   * empty result.
   */
  async generateSyllabus(): Promise<void> {
    const workspace = this.deps.host.activeWorkspace();
    if (!workspace?.mission) {
      this.deps.host.notify("Define a mission first");
      return;
    }
    if (!this.deps.host.apiKey().trim()) {
      this.deps.host.notify("Add your OpenRouter key in Settings");
      return;
    }

    const operationId = this.deps.host.beginOperation("Generating syllabus…");
    try {
      const { group, items } = await this.deps.generateSyllabus.execute({
        mission: workspace.mission,
        workspaceId: workspace.id,
        apiKey: this.deps.host.apiKey(),
        model: this.deps.host.model(),
      });
      this.deps.host.endOperation(operationId);
      await this.deps.host.onSyllabusCreated({ group, items, workspaceId: workspace.id });
    } catch (error) {
      const message = messageFor(error, "Could not generate syllabus");
      this.deps.host.failOperation(operationId, message);
      this.deps.host.notify(message);
    }
  }
}
