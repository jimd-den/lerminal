import { describe, expect, it } from "bun:test";
import {
  commandNameOf,
  commonParentId,
  describeRunOutput,
  shouldAutoGroup,
  wasGeneratedTogether,
} from "../runOutcome";
import { Card, createCard } from "../../../entities/card";

const START = 1_800_000_000_000;

const made = (
  id: string,
  options: { parentId?: string; createdAt?: number; type?: Card["type"] } = {},
): Card => ({
  ...createCard({
    workspaceId: "w1",
    type: options.type ?? "note",
    title: id,
    body: "b",
    parentId: options.parentId,
  }),
  id,
  createdAt: options.createdAt ?? START + 1,
});

describe("commonParentId", () => {
  it("reports the shared parent", () => {
    expect(commonParentId([made("a", { parentId: "g1" }), made("b", { parentId: "g1" })])).toBe(
      "g1",
    );
  });

  it("reports nothing when the cards landed in different places", () => {
    expect(
      commonParentId([made("a", { parentId: "g1" }), made("b", { parentId: "g2" })]),
    ).toBeUndefined();
  });

  it("reports nothing for root-level cards or an empty result", () => {
    expect(commonParentId([made("a")])).toBeUndefined();
    expect(commonParentId([])).toBeUndefined();
  });
});

describe("wasGeneratedTogether", () => {
  it("is true when every card postdates the run's start", () => {
    expect(wasGeneratedTogether([made("a"), made("b")], START)).toBe(true);
  });

  it("is false when a card predates the run — it was passed through, not made", () => {
    expect(
      wasGeneratedTogether([made("a"), made("old", { createdAt: START - 5000 })], START),
    ).toBe(false);
  });
});

describe("shouldAutoGroup", () => {
  const decide = (cards: Card[], autoGroupEnabled = true) =>
    shouldAutoGroup({ cards, startedAt: START, autoGroupEnabled });

  it("groups a single created card, not just multi-card results", () => {
    expect(decide([made("a")])).toBe(true);
  });

  it("does not group when the user turned auto-grouping off", () => {
    expect(decide([made("a"), made("b")], false)).toBe(false);
  });

  it("does not group an empty result", () => {
    expect(decide([])).toBe(false);
  });

  it("does not group cards the run merely passed through", () => {
    // `space` returns the cards it was given; wrapping those would move existing work.
    expect(decide([made("existing", { createdAt: START - 1000 })])).toBe(false);
  });

  it("does not group output that landed in different places", () => {
    expect(decide([made("a", { parentId: "g1" }), made("b", { parentId: "g2" })])).toBe(
      false,
    );
  });
});

describe("commandNameOf", () => {
  it("takes the leading command of a pipeline", () => {
    expect(commandNameOf("chunk | recall | space")).toBe("chunk");
    expect(commandNameOf('  ask "React hooks"')).toBe("ask");
    expect(commandNameOf("status-report")).toBe("status-report");
  });

  it("falls back to a neutral label when there is nothing to read", () => {
    expect(commandNameOf("   ")).toBe("command");
  });
});

describe("describeRunOutput", () => {
  it("names chunks as study chunks and everything else as items", () => {
    expect(describeRunOutput([made("a", { type: "chunk" })])).toBe("1 study chunk created");
    expect(describeRunOutput([made("a"), made("b")])).toBe("2 items created");
  });

  it("stops calling a mixed result chunks", () => {
    expect(describeRunOutput([made("a", { type: "chunk" }), made("b")])).toBe(
      "2 items created",
    );
  });
});
