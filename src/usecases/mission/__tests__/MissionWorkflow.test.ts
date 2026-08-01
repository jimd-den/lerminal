import { describe, expect, it, beforeEach } from "bun:test";
import { MissionWorkflow, MissionHost, SyllabusOutcome } from "../MissionWorkflow";
import { GapReportInteractor } from "../../report/GapReportInteractor";
import { GenerateSyllabusInteractor } from "../../agent/GenerateSyllabusInteractor";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { MemoryWorkspaceRepository } from "../../../adapters/repositories/MemoryWorkspaceRepository";
import { AgentGateway, AgentAskResult, AgentModel } from "../../ports/gateways/AgentGateway";
import { createWorkspace, Workspace } from "../../../entities/workspace";
import { Card } from "../../../entities/card";

class StubAgentGateway implements AgentGateway {
  async ask(): Promise<AgentAskResult> {
    return { cards: [], isLocalFallback: false };
  }
  async fetchModels(): Promise<AgentModel[]> {
    return [];
  }
}

class RecordingHost implements MissionHost {
  workspace: Workspace | undefined;
  cardList: Card[] = [];
  key = "";
  changes = 0;
  messages: string[] = [];
  saved: Workspace[] = [];
  preflightPrompts: string[] = [];
  syllabi: SyllabusOutcome[] = [];
  operations: string[] = [];
  failures: string[] = [];

  activeWorkspace() {
    return this.workspace;
  }
  cards() {
    return this.cardList;
  }
  apiKey() {
    return this.key;
  }
  model() {
    return "some/model";
  }
  onChange() {
    this.changes++;
  }
  notify(message: string) {
    this.messages.push(message);
  }
  onWorkspaceSaved(workspace: Workspace) {
    this.saved.push(workspace);
    this.workspace = workspace;
  }
  openStatusReportPreflight(prompt: string) {
    this.preflightPrompts.push(prompt);
  }
  async onSyllabusCreated(outcome: SyllabusOutcome) {
    this.syllabi.push(outcome);
  }
  beginOperation(label: string) {
    this.operations.push(label);
    return `op-${this.operations.length}`;
  }
  endOperation() {}
  failOperation(_id: string, message: string) {
    this.failures.push(message);
  }
}

describe("MissionWorkflow", () => {
  let host: RecordingHost;
  let workspaceRepo: MemoryWorkspaceRepository;
  let workflow: MissionWorkflow;

  beforeEach(() => {
    host = new RecordingHost();
    host.workspace = createWorkspace({ name: "Space" });
    workspaceRepo = new MemoryWorkspaceRepository();
    workflow = new MissionWorkflow({
      workspaceRepo,
      gapReport: new GapReportInteractor(),
      generateSyllabus: new GenerateSyllabusInteractor(
        new StubAgentGateway(),
        new MemoryCardRepository(),
      ),
      host,
    });
  });

  it("opens the editor with an empty draft when no mission exists", () => {
    workflow.openEditor();
    expect(workflow.state.isEditorOpen).toBe(true);
    expect(workflow.state.draft.goalTitle).toBe("");
  });

  it("refuses to save a mission with no goal, and says why", async () => {
    workflow.openEditor();
    await workflow.saveDraft();

    expect(host.saved).toHaveLength(0);
    expect(host.messages[0]).toContain("goal title");
    expect(workflow.state.isEditorOpen).toBe(true);
  });

  it("persists a mission and reopens the editor with it", async () => {
    workflow.openEditor();
    workflow.updateDraft({ goalTitle: "Ship the thing" });
    workflow.addCriterion("It runs");
    await workflow.saveDraft();

    expect(host.saved).toHaveLength(1);
    expect(host.saved[0].mission?.goalTitle).toBe("Ship the thing");
    expect(await workspaceRepo.getWorkspaces()).toHaveLength(1);
    expect(workflow.state.isEditorOpen).toBe(false);

    workflow.openEditor();
    expect(workflow.state.draft.goalTitle).toBe("Ship the thing");
    expect(workflow.state.draft.successCriteria).toEqual(["It runs"]);
  });

  it("ignores a blank criterion and removes by index", () => {
    workflow.openEditor();
    workflow.addCriterion("   ");
    expect(workflow.state.draft.successCriteria).toEqual([]);

    workflow.addCriterion("a");
    workflow.addCriterion("b");
    workflow.removeCriterion(0);
    expect(workflow.state.draft.successCriteria).toEqual(["b"]);
  });

  it("edits a draft without touching the saved workspace until saved", () => {
    workflow.openEditor();
    workflow.updateDraft({ goalTitle: "Draft only" });
    expect(host.saved).toHaveLength(0);
  });

  it("computes a gap report with no API key and without storing it", () => {
    expect(host.key).toBe("");
    const first = workflow.computeGapReport();
    const second = workflow.computeGapReport();

    expect(first).not.toBeNull();
    expect(second).not.toBe(first!); // recomputed, never cached
  });

  it("hands the current report to the status-report preflight", async () => {
    workflow.openGapReport();
    workflow.enrichGapReport();

    expect(workflow.state.isGapReportOpen).toBe(false);
    expect(host.preflightPrompts).toHaveLength(1);
    expect(host.preflightPrompts[0].length).toBeGreaterThan(0);
  });

  it("declines to generate a syllabus with no mission defined", async () => {
    await workflow.generateSyllabus();
    expect(host.messages[0]).toContain("Define a mission");
    expect(host.operations).toHaveLength(0);
  });

  it("declines to generate a syllabus with no API key, before starting any work", async () => {
    workflow.openEditor();
    workflow.updateDraft({ goalTitle: "Goal" });
    await workflow.saveDraft();

    await workflow.generateSyllabus();
    expect(host.messages.some((m) => m.includes("OpenRouter key"))).toBe(true);
    expect(host.operations).toHaveLength(0);
    expect(host.syllabi).toHaveLength(0);
  });

  it("reports a failed syllabus run against its own pending operation", async () => {
    workflow.openEditor();
    workflow.updateDraft({ goalTitle: "Goal" });
    await workflow.saveDraft();
    host.key = "sk-test";

    await workflow.generateSyllabus();

    expect(host.operations).toHaveLength(1);
    expect(host.failures).toHaveLength(1);
    expect(host.syllabi).toHaveLength(0);
  });

  it("switches phase in either direction and persists it", async () => {
    workflow.openEditor();
    workflow.updateDraft({ goalTitle: "Goal" });
    await workflow.saveDraft();

    await workflow.setPhase("build");
    expect(host.workspace?.mission?.currentPhase).toBe("build");

    await workflow.setPhase("define");
    expect(host.workspace?.mission?.currentPhase).toBe("define");
  });
});
