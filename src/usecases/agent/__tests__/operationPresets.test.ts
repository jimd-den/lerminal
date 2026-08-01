import { describe, expect, it } from "bun:test";
import { createCard } from "../../../entities/card";
import { buildAgentRunRequest, buildPipelineText, findOperationPreset, OPERATION_PRESETS } from "../operationPresets";

describe("OPERATION_PRESETS", () => {
  it("declares exactly the seven canonical operation presets", () => {
    const ids = OPERATION_PRESETS.map(p => p.id).sort();
    expect(ids).toEqual([
      "explain-selected",
      "find-prerequisites",
      "make-study-cards",
      "plan-capstone",
      "plan-experiment",
      "research-web",
      "status-report",
    ]);
  });

  it("only research-web defaults web on", () => {
    for (const preset of OPERATION_PRESETS) {
      const webDefault = preset.defaultScope === "web" || preset.defaultScope === "selected-plus-web";
      expect(webDefault).toBe(preset.id === "research-web");
    }
  });
});

describe("buildAgentRunRequest", () => {
  it("marks web as unused and leaves context empty for a selected-only preset with no selection", () => {
    const preset = findOperationPreset("explain-selected")!;
    const request = buildAgentRunRequest({
      preset,
      workspaceId: "w",
      parentId: null,
      allCards: [],
      selectedCards: [],
    });

    expect(request.webUsed).toBe(false);
    expect(request.contextCardIds).toEqual([]);
    expect(request.destinationLabel).toBe("Workspace root");
  });

  it("marks web as used for the research-web preset and reads no cards", () => {
    const preset = findOperationPreset("research-web")!;
    const card = createCard({ workspaceId: "w", type: "note", title: "N", body: "B" });
    const request = buildAgentRunRequest({
      preset,
      workspaceId: "w",
      parentId: null,
      allCards: [card],
      selectedCards: [card],
      query: "eigenvectors",
    });

    expect(request.webUsed).toBe(true);
    expect(request.contextCardIds).toEqual([]);
    expect(request.query).toBe("eigenvectors");
  });

  it("resolves destinationLabel to the current group's title when a parentId is set", () => {
    const group = createCard({ id: "g1", workspaceId: "w", type: "group", title: "React Hooks", body: "" });
    const preset = findOperationPreset("explain-selected")!;
    const request = buildAgentRunRequest({
      preset,
      workspaceId: "w",
      parentId: "g1",
      allCards: [group],
      selectedCards: [],
    });

    expect(request.destinationLabel).toBe("React Hooks");
  });

  it("reports contextTruncated from the underlying scope resolution", () => {
    const preset = findOperationPreset("find-prerequisites")!;
    const parent = createCard({ id: "p", workspaceId: "w", type: "group", title: "P", body: "" });
    const siblings = Array.from({ length: 20 }, (_, i) =>
      createCard({ id: `s${i}`, workspaceId: "w", type: "note", title: `S${i}`, body: "b", parentId: "p" })
    );
    const request = buildAgentRunRequest({
      preset,
      workspaceId: "w",
      parentId: "p",
      allCards: [parent, ...siblings],
      selectedCards: [],
      budget: { maxCards: 3, maxCharacters: 100000 },
    });

    expect(request.contextTruncated).toBe(true);
    expect(request.contextCardIds.length).toBe(3);
  });
});

describe("buildPipelineText", () => {
  it("builds an ask pipeline with --profile and a quoted, escaped query", () => {
    const preset = findOperationPreset("explain-selected")!;
    const text = buildPipelineText(preset, 'Explain "quantum" tunneling');

    expect(text).toBe('ask --profile builtin-generate-cards "Explain \\"quantum\\" tunneling"');
  });

  it("falls back to the preset's defaultQuery when no query is supplied", () => {
    const preset = findOperationPreset("plan-capstone")!;
    const text = buildPipelineText(preset);

    expect(text).toContain("--profile builtin-capstone-planner");
    expect(text).toContain(preset.defaultQuery!);
  });

  it("refuses to build a pipeline string for research-web (it dispatches to the research flow instead)", () => {
    const preset = findOperationPreset("research-web")!;

    expect(() => buildPipelineText(preset, "eigenvectors")).toThrow();
  });

  it("builds a bare recall pipeline for make-study-cards (no query, no profile)", () => {
    const preset = findOperationPreset("make-study-cards")!;
    const text = buildPipelineText(preset);

    expect(text).toBe("recall");
  });
});
