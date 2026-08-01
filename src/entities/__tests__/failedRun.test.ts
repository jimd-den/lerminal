import { describe, expect, it } from "bun:test";
import { createCard } from "../card";
import { createFailedRunCard, isFailedRunCard, readFailedRunCard } from "../failedRun";
import { BUILTIN_CARD_TYPES, isSchedulable } from "../cardTypeDefinition";

const failure = () =>
  createFailedRunCard({
    workspaceId: "w",
    pipelineText: 'ask "why do birds sing"',
    inputCardIds: ["c1", "c2"],
    parentId: "g1",
    errorMessage: "Agent request failed",
    failedAt: 1700000000000,
  });

describe("createFailedRunCard", () => {
  it("lands where the output would have gone, so the record isn't orphaned", () => {
    expect(failure().parentId).toBe("g1");
  });

  it("leads with the operation, not the error — a deck reads as a list of runs", () => {
    expect(failure().title).toBe('Failed: ask "why do birds sing"');
  });

  it("is never studiable, since a failure is not material", () => {
    expect(isSchedulable(failure(), BUILTIN_CARD_TYPES)).toBe(false);
  });
});

describe("readFailedRunCard", () => {
  it("round-trips everything a faithful retry needs", () => {
    const details = readFailedRunCard(failure())!;

    expect(details.pipelineText).toBe('ask "why do birds sing"');
    expect(details.inputCardIds).toEqual(["c1", "c2"]);
    expect(details.parentId).toBe("g1");
    expect(details.errorMessage).toBe("Agent request failed");
    expect(details.failedAt).toBe(1700000000000);
  });

  it("round-trips a root-level run with no inputs", () => {
    const card = createFailedRunCard({
      workspaceId: "w",
      pipelineText: "review",
      inputCardIds: [],
      parentId: null,
      errorMessage: "Nothing due",
      failedAt: 1,
    });

    const details = readFailedRunCard(card)!;

    expect(details.parentId).toBeNull();
    expect(details.inputCardIds).toEqual([]);
  });

  it("returns null for a card that isn't a failure record", () => {
    const note = createCard({ workspaceId: "w", type: "note", title: "N", body: "B" });

    expect(readFailedRunCard(note)).toBeNull();
  });

  it("refuses a malformed record rather than offering a misleading retry", () => {
    // Half a payload would still run *something* — just not the thing that failed.
    const noPipeline = { ...failure(), fields: { errorMessage: "e" } };
    expect(readFailedRunCard(noPipeline as any)).toBeNull();

    const badJson = { ...failure(), fields: { ...failure().fields!, inputCardIds: "{{{" } };
    expect(readFailedRunCard(badJson as any)).toBeNull();
  });

  it("ignores non-string entries in the input list", () => {
    const card = { ...failure(), fields: { ...failure().fields!, inputCardIds: '["a", 3, null]' } };

    expect(readFailedRunCard(card as any)!.inputCardIds).toEqual(["a"]);
  });
});

describe("isFailedRunCard", () => {
  it("recognises a failure card and nothing else", () => {
    expect(isFailedRunCard(failure())).toBe(true);
    expect(isFailedRunCard(createCard({ workspaceId: "w", type: "note", title: "N", body: "" }))).toBe(false);
  });
});
