import { describe, expect, it } from "bun:test";
import { createWorkspace } from "../workspace";

describe("Workspace Entity Factory", () => {
  it("should create a workspace with a generated ID and timestamp", () => {
    const ws = createWorkspace({
      name: "Machine Learning",
    });

    expect(ws.id).toBeDefined();
    expect(ws.id.length).toBeGreaterThan(0);
    expect(ws.name).toBe("Machine Learning");
    expect(ws.createdAt).toBeDefined();
    expect(ws.createdAt).toBeLessThanOrEqual(Date.now());
  });

  it("should truncate names that are too long to ensure clean UI rendering", () => {
    const ws = createWorkspace({
      name: "Very Long Workspace Name That Exceeds Screen Real Estate Constraints",
    });

    expect(ws.name).toBe("Very Long Workspace Na…");
  });
});
