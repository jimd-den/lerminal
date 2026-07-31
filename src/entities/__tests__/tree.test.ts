import { describe, expect, it } from "bun:test";
import { createCard } from "../../entities/card";
import {
  breadcrumbPath,
  collectDescendants,
  directChildren,
  expandForPipe,
  selectionRoots,
} from "../tree";

// Build a small tree:  root -> g1 -> [a, g2 -> [b]]
const g1 = createCard({ id: "g1", workspaceId: "w", type: "group", title: "G1", body: "" });
const a = createCard({ id: "a", workspaceId: "w", type: "chunk", title: "A", body: "x", parentId: "g1" });
const g2 = createCard({ id: "g2", workspaceId: "w", type: "group", title: "G2", body: "", parentId: "g1" });
const b = createCard({ id: "b", workspaceId: "w", type: "chunk", title: "B", body: "y", parentId: "g2" });
const rootCard = createCard({ id: "r", workspaceId: "w", type: "note", title: "R", body: "z" });
const ALL = [g1, a, g2, b, rootCard];

describe("tree helpers", () => {
  it("directChildren returns immediate children only", () => {
    expect(directChildren(ALL, null).map(c => c.id).sort()).toEqual(["g1", "r"]);
    expect(directChildren(ALL, "g1").map(c => c.id).sort()).toEqual(["a", "g2"]);
  });

  it("collectDescendants walks the whole subtree", () => {
    expect(collectDescendants(ALL, "g1").map(c => c.id).sort()).toEqual(["a", "b", "g2"]);
    expect(collectDescendants(ALL, "g2").map(c => c.id)).toEqual(["b"]);
  });

  it("expandForPipe expands selected groups to their descendants", () => {
    const expanded = expandForPipe(ALL, ["g1"]).map(c => c.id).sort();
    expect(expanded).toEqual(["a", "b", "g1", "g2"]);
  });

  it("expandForPipe leaves non-group selections untouched", () => {
    expect(expandForPipe(ALL, ["a", "r"]).map(c => c.id).sort()).toEqual(["a", "r"]);
  });

  it("selectionRoots keeps only top nodes, preserving substructure", () => {
    // Selecting g1 and its descendant a: only g1 is a root.
    expect(selectionRoots([g1, a, g2, b]).map(c => c.id)).toEqual(["g1"]);
    // Sibling leaves with a shared (unselected) parent are all roots.
    expect(selectionRoots([a, g2]).map(c => c.id).sort()).toEqual(["a", "g2"]);
  });

  it("breadcrumbPath returns root-to-node chain", () => {
    expect(breadcrumbPath(ALL, "g2").map(c => c.id)).toEqual(["g1", "g2"]);
    expect(breadcrumbPath(ALL, null)).toEqual([]);
  });
});
