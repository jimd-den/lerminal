import { describe, expect, it } from "bun:test";
import {
  createCommandDefinition,
  isCommandVisibleInWorkspace,
  resolveCommandScope,
} from "../commandDefinition";

describe("createCommandDefinition — legacy fields unaffected", () => {
  it("still builds a valid agent command with no new fields supplied", () => {
    const def = createCommandDefinition({
      name: "Explain Simply",
      kind: "agent",
      systemPrompt: "Explain like I'm new to this.",
    });

    expect(def.kind).toBe("agent");
    expect(def.name).toBe("explain-simply");
    expect(def.scope).toBeUndefined();
  });

  it("still builds a valid pipeline command with no new fields supplied", () => {
    const def = createCommandDefinition({
      name: "learn",
      kind: "pipeline",
      body: 'ask "$1" | chunk | recall | space',
    });

    expect(def.kind).toBe("pipeline");
    expect(def.scope).toBeUndefined();
  });
});

describe("resolveCommandScope", () => {
  it("defaults an unset scope to global — every command's behavior before this field existed", () => {
    const def = createCommandDefinition({ name: "x", kind: "pipeline", body: "note" });

    expect(resolveCommandScope(def)).toBe("global");
  });

  it("carries an explicit scope through", () => {
    const def = createCommandDefinition({
      name: "x",
      kind: "pipeline",
      body: "note",
      scope: "workspace",
      workspaceId: "ws-1",
    });

    expect(resolveCommandScope(def)).toBe("workspace");
  });
});

describe("isCommandVisibleInWorkspace", () => {
  it("shows a global command everywhere", () => {
    const def = createCommandDefinition({ name: "x", kind: "pipeline", body: "note" });

    expect(isCommandVisibleInWorkspace(def, "ws-1")).toBe(true);
    expect(isCommandVisibleInWorkspace(def, "ws-2")).toBe(true);
    expect(isCommandVisibleInWorkspace(def, null)).toBe(true);
  });

  it("shows a session command everywhere too — it's bounded by never being persisted, not by this check", () => {
    const def = createCommandDefinition({
      name: "x",
      kind: "pipeline",
      body: "note",
      scope: "session",
    });

    expect(isCommandVisibleInWorkspace(def, "ws-1")).toBe(true);
  });

  it("hides a workspace-scoped command from a different workspace", () => {
    const def = createCommandDefinition({
      name: "x",
      kind: "pipeline",
      body: "note",
      scope: "workspace",
      workspaceId: "ws-1",
    });

    expect(isCommandVisibleInWorkspace(def, "ws-2")).toBe(false);
    expect(isCommandVisibleInWorkspace(def, null)).toBe(false);
  });

  it("shows a workspace-scoped command in its own workspace", () => {
    const def = createCommandDefinition({
      name: "x",
      kind: "pipeline",
      body: "note",
      scope: "workspace",
      workspaceId: "ws-1",
    });

    expect(isCommandVisibleInWorkspace(def, "ws-1")).toBe(true);
  });
});

describe("createCommandDefinition — new metadata fields", () => {
  it("round-trips webUse, input/output roles, and requiredInputCount", () => {
    const def = createCommandDefinition({
      name: "assess-source",
      kind: "agent",
      systemPrompt: "Assess the retained source.",
      webUse: false,
      requiredInputRoles: ["source"],
      requiredInputCount: "one-or-more",
      outputRoles: ["claim"],
    });

    expect(def.webUse).toBe(false);
    expect(def.requiredInputRoles).toEqual(["source"]);
    expect(def.requiredInputCount).toBe("one-or-more");
    expect(def.outputRoles).toEqual(["claim"]);
  });
});
