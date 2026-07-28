import { describe, expect, it } from "bun:test";
import { createWorkspace, createWorkspaceMission, updateWorkspaceMission, DEFAULT_FSRS_CONFIG } from "../workspace";

/**
 * # Workspace / Study Space Entity Specification
 *
 * ## Business Value & Rationale
 * A Workspace represents a bounded study space. In ChunkBuddy, each study space carries its own
 * FSRS parameters (such as `desiredRetention`, `learningStepsMinutes`, `maximumIntervalDays`).
 * This lets users tune retention targets per space (e.g. 0.95 for high-stakes exam prep vs 0.85 for casual reading).
 */
describe("Workspace Entity Factory & FSRS Configuration", () => {
  it("should create a workspace with default FSRS-5 settings", () => {
    const ws = createWorkspace({
      name: "WebGPU Rendering",
    });

    expect(ws.id).toBeDefined();
    expect(ws.name).toBe("WebGPU Rendering");
    expect(ws.fsrsConfig).toBeDefined();
    expect(ws.fsrsConfig.schedulerVersion).toBe("fsrs-5");
    expect(ws.fsrsConfig.desiredRetention).toBe(0.9);
    expect(ws.fsrsConfig.maximumIntervalDays).toBe(36500);
    expect(ws.fsrsConfig.learningStepsMinutes).toEqual([1, 10]);
  });

  it("should allow overriding FSRS parameters for space-specific retention targets", () => {
    const ws = createWorkspace({
      name: "Medical Exam Prep",
      fsrsConfig: {
        ...DEFAULT_FSRS_CONFIG,
        desiredRetention: 0.95,
      },
    });

    expect(ws.fsrsConfig.desiredRetention).toBe(0.95);
  });

  it("should truncate names that are too long to ensure clean UI rendering", () => {
    const ws = createWorkspace({
      name: "Very Long Workspace Name That Exceeds Screen Real Estate Constraints",
    });

    expect(ws.name).toBe("Very Long Workspace Na…");
  });

  it("should leave mission unset for workspaces created without a goal (backwards compatible)", () => {
    const ws = createWorkspace({ name: "Untitled" });
    expect(ws.mission).toBeUndefined();
  });

  it("should attach a mission created via createWorkspaceMission", () => {
    const mission = createWorkspaceMission({
      goalTitle: "Ship a WebGPU renderer",
      successCriteria: ["Renders a textured cube", "60fps on a mid-range laptop"],
    });
    const ws = createWorkspace({ name: "WebGPU Rendering", mission });

    expect(ws.mission?.goalTitle).toBe("Ship a WebGPU renderer");
    expect(ws.mission?.currentPhase).toBe("define");
    expect(ws.mission?.successCriteria.length).toBe(2);
  });
});

describe("WorkspaceMission Factory & Updates", () => {
  it("should default optional fields and the phase to 'define'", () => {
    const mission = createWorkspaceMission({ goalTitle: "Learn eigenvectors" });

    expect(mission.goalTitle).toBe("Learn eigenvectors");
    expect(mission.goalDescription).toBe("");
    expect(mission.successCriteria).toEqual([]);
    expect(mission.currentPhase).toBe("define");
    expect(mission.createdAt).toBe(mission.updatedAt);
  });

  it("should refresh updatedAt without mutating the original mission on update", () => {
    const mission = createWorkspaceMission({ goalTitle: "Learn eigenvectors", createdAt: 1000, updatedAt: 1000 });
    const updated = updateWorkspaceMission(mission, { currentPhase: "build" });

    expect(mission.currentPhase).toBe("define");
    expect(updated.currentPhase).toBe("build");
    expect(updated.updatedAt).toBeGreaterThanOrEqual(mission.updatedAt);
    expect(updated.createdAt).toBe(1000);
  });
});
