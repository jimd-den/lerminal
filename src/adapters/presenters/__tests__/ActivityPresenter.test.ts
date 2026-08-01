import { describe, expect, it } from "bun:test";
import { presentActivity } from "../ActivityPresenter";

function baseState(overrides: any = {}) {
  return {
    pendingOperations: [],
    isCreatingBrief: false,
    isSuggestingQueries: false,
    isInstallingFont: false,
    researchLoading: false,
    chatStreamingCardId: null,
    ...overrides,
  };
}

const running = (pipelineText: string) => ({
  id: "op-1",
  commandName: pipelineText,
  pipelineText,
  status: "loading" as const,
});

describe("presentActivity", () => {
  it("reports nothing when the app is idle", () => {
    expect(presentActivity(baseState() as any)).toBeNull();
  });

  it("names the running command in plain language rather than echoing the pipeline", () => {
    const activity = presentActivity(baseState({ pendingOperations: [running("chunk")] }) as any)!;

    expect(activity.label).toBe("Break into study chunks");
  });

  it("flags model use for an agent-backed command", () => {
    const activity = presentActivity(baseState({ pendingOperations: [running('ask "x"')] }) as any)!;

    expect(activity.usesModel).toBe(true);
    // `ask` calls a model but never browses — the distinction the whole app is about.
    expect(activity.usesWeb).toBe(false);
  });

  it("flags web use without model use for search", () => {
    const activity = presentActivity(baseState({ pendingOperations: [running('search "x"')] }) as any)!;

    expect(activity.usesWeb).toBe(true);
    expect(activity.usesModel).toBe(false);
  });

  it("claims neither exposure for a deterministic command", () => {
    const activity = presentActivity(baseState({ pendingOperations: [running("recall")] }) as any)!;

    expect(activity.usesModel).toBe(false);
    expect(activity.usesWeb).toBe(false);
  });

  it("describes a pipeline by the stage that is actually running", () => {
    const activity = presentActivity(
      baseState({ pendingOperations: [running("chunk | recall | space")] }) as any
    )!;

    expect(activity.label).toBe("Break into study chunks");
  });

  it("makes no exposure claim for an unknown custom command", () => {
    const activity = presentActivity(baseState({ pendingOperations: [running("my-macro")] }) as any)!;

    expect(activity.label).toBe("Running my-macro");
    expect(activity.usesModel).toBe(false);
    expect(activity.usesWeb).toBe(false);
  });

  it("surfaces a failure ahead of anything still running", () => {
    const state = baseState({
      pendingOperations: [
        running("recall"),
        {
          id: "op-2",
          commandName: "ask",
          pipelineText: 'ask "x"',
          status: "error",
          errorMessage: "Agent request failed",
        },
      ],
    });

    const activity = presentActivity(state as any)!;

    expect(activity.error).not.toBeNull();
    expect(activity.error!.message).toBe("Agent request failed");
    expect(activity.error!.operationId).toBe("op-2");
  });

  it("offers retry only for a single-stage run", () => {
    const single = presentActivity(
      baseState({
        pendingOperations: [{ id: "a", commandName: "ask", pipelineText: 'ask "x"', status: "error", errorMessage: "e" }],
      }) as any
    )!;
    expect(single.error!.canRetry).toBe(true);

    const piped = presentActivity(
      baseState({
        pendingOperations: [{ id: "b", commandName: "p", pipelineText: "ask | chunk", status: "error", errorMessage: "e" }],
      }) as any
    )!;
    // Re-running a pipeline from a failed midpoint isn't safe, so it isn't offered.
    expect(piped.error!.canRetry).toBe(false);
  });

  it("reports the other AI paths that previously showed nothing outside their own sheet", () => {
    expect(presentActivity(baseState({ isCreatingBrief: true }) as any)!.usesModel).toBe(true);
    expect(presentActivity(baseState({ isSuggestingQueries: true }) as any)!.usesModel).toBe(true);
    expect(presentActivity(baseState({ chatStreamingCardId: "c1" }) as any)!.usesModel).toBe(true);
  });

  it("reports web-only work as web, not model", () => {
    const research = presentActivity(baseState({ researchLoading: true }) as any)!;
    expect(research.usesWeb).toBe(true);
    expect(research.usesModel).toBe(false);

    const font = presentActivity(baseState({ isInstallingFont: true }) as any)!;
    expect(font.usesWeb).toBe(true);
    expect(font.usesModel).toBe(false);
  });
});
