import { describe, expect, it } from "bun:test";
import { planDeletion } from "../deletionPlan";
import { Card, createCard } from "../../../entities/card";

const make = (id: string, parentId?: string, type: Card["type"] = "note"): Card => ({
  ...createCard({ workspaceId: "w1", type, title: id, body: "b", parentId }),
  id,
});

/**
 * root
 *  └ g1 (group)
 *     ├ g2 (group)
 *     │   └ deep
 *     └ child
 *  └ loose
 */
const graph: Card[] = [
  make("g1", undefined, "group"),
  make("g2", "g1", "group"),
  make("deep", "g2"),
  make("child", "g1"),
  make("loose"),
];

const plan = (
  selected: string[],
  options: { currentGroupId?: string | null; recursiveGroups?: boolean } = {},
) =>
  planDeletion({
    cards: graph,
    selectedIds: new Set(selected),
    currentGroupId: options.currentGroupId ?? null,
    recursiveGroups: options.recursiveGroups ?? false,
  });

describe("planDeletion", () => {
  it("deletes exactly what was selected when nothing is nested", () => {
    expect(plan(["loose"]).toDelete.map((c) => c.id)).toEqual(["loose"]);
  });

  it("orders deletions deepest first, so no parent goes before its children", () => {
    const order = plan(["g1", "deep", "child"]).toDelete.map((c) => c.id);
    expect(order.indexOf("deep")).toBeLessThan(order.indexOf("child"));
    expect(order.indexOf("child")).toBeLessThan(order.indexOf("g1"));
  });

  it("skips cards already covered by a recursive delete of their ancestor", () => {
    const result = plan(["g1", "deep", "child"], { recursiveGroups: true });
    expect(result.toDelete.map((c) => c.id)).toEqual(["g1"]);
    // The count the user is told about is still what they selected.
    expect(result.selected).toHaveLength(3);
  });

  it("keeps nested selections when contents are promoted rather than deleted", () => {
    const result = plan(["g1", "child"], { recursiveGroups: false });
    expect(result.toDelete.map((c) => c.id).sort()).toEqual(["child", "g1"]);
  });

  it("leaves the user where they are when their group survives", () => {
    expect(plan(["loose"], { currentGroupId: "g1" }).nextGroupId).toBe("g1");
  });

  it("moves the user up when the group they are inside is deleted", () => {
    expect(plan(["g2"], { currentGroupId: "g2" }).nextGroupId).toBe("g1");
  });

  it("moves the user out to the root when a top-level group is deleted", () => {
    expect(plan(["g1"], { currentGroupId: "g1" }).nextGroupId).toBeNull();
  });

  it("moves the user up when an ancestor is recursively deleted around them", () => {
    expect(
      plan(["g1"], { currentGroupId: "g2", recursiveGroups: true }).nextGroupId,
    ).toBeNull();
  });

  it("keeps the user in place when an ancestor is deleted but contents are promoted", () => {
    // g2 survives as g1's contents are promoted to the root, so standing inside it is fine.
    expect(
      plan(["g1"], { currentGroupId: "g2", recursiveGroups: false }).nextGroupId,
    ).toBe("g2");
  });

  it("changes nothing about the input", () => {
    const before = JSON.stringify(graph);
    plan(["g1", "deep"], { currentGroupId: "g2", recursiveGroups: true });
    expect(JSON.stringify(graph)).toBe(before);
  });

  it("handles an empty selection", () => {
    const result = plan([], { currentGroupId: "g1" });
    expect(result.toDelete).toEqual([]);
    expect(result.nextGroupId).toBe("g1");
  });
});
