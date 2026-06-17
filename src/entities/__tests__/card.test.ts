import { describe, expect, it } from "bun:test";
import { createCard } from "../card";

describe("Card Entity Factory", () => {
  it("should create a card with generated id and createdAt when they are not provided", () => {
    const card = createCard({
      workspaceId: "ws-123",
      type: "chunk",
      title: "Core Concept",
      body: "This is the body of the chunk.",
      cite: "Source Book",
    });

    expect(card.id).toBeDefined();
    expect(card.id.length).toBeGreaterThan(0);
    expect(card.workspaceId).toBe("ws-123");
    expect(card.type).toBe("chunk");
    expect(card.title).toBe("Core Concept");
    expect(card.body).toBe("This is the body of the chunk.");
    expect(card.cite).toBe("Source Book");
    expect(card.createdAt).toBeDefined();
    expect(card.createdAt).toBeLessThanOrEqual(Date.now());
  });

  it("should preserve specific id and createdAt if provided", () => {
    const customTime = 1623823200000;
    const card = createCard({
      id: "custom-id-999",
      workspaceId: "ws-123",
      type: "source",
      title: "My Source",
      body: "File content",
      createdAt: customTime,
    });

    expect(card.id).toBe("custom-id-999");
    expect(card.createdAt).toBe(customTime);
  });
});
