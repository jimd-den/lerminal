import { describe, expect, it } from "bun:test";
import { createCard } from "../card";
import { canUndoCreate, createOperationRecord } from "../operationLog";

describe("OperationRecord Entity Factory", () => {
  it("should default array fields and generate an id when omitted", () => {
    const record = createOperationRecord({
      commandName: "ask",
      workspaceId: "ws-1",
      startedAt: Date.now(),
      summary: "1 chunk created",
    });

    expect(record.id).toBeDefined();
    expect(record.inputCardIds).toEqual([]);
    expect(record.createdCardIds).toEqual([]);
    expect(record.webUsed).toBe(false);
  });

  it("should capture web usage and local-fallback labeling for a run receipt", () => {
    const record = createOperationRecord({
      commandName: "ask",
      workspaceId: "ws-1",
      startedAt: Date.now(),
      webUsed: false,
      usedLocalFallback: true,
      model: "openrouter/some-model",
      summary: "2 chunks created (local fallback — no API key configured)",
    });

    expect(record.webUsed).toBe(false);
    expect(record.usedLocalFallback).toBe(true);
    expect(record.summary).toContain("local fallback");
  });
});

describe("canUndoCreate", () => {
  it("should refuse when no snapshots were captured", () => {
    const card = createCard({ id: "c1", workspaceId: "w", type: "chunk", title: "T", body: "B" });
    const record = createOperationRecord({
      commandName: "ask",
      workspaceId: "w",
      createdCardIds: [card.id],
      startedAt: Date.now(),
      summary: "1 created",
    });

    expect(canUndoCreate(record, [card])).toBe(false);
  });

  it("should allow undo when the created card is unchanged since the snapshot", () => {
    const card = createCard({ id: "c1", workspaceId: "w", type: "chunk", title: "T", body: "B" });
    const record = createOperationRecord({
      commandName: "ask",
      workspaceId: "w",
      createdCardIds: [card.id],
      createdCardSnapshots: [card],
      startedAt: Date.now(),
      summary: "1 created",
    });

    expect(canUndoCreate(record, [card])).toBe(true);
  });

  it("should refuse when the card has been edited since creation", () => {
    const card = createCard({ id: "c1", workspaceId: "w", type: "chunk", title: "T", body: "B" });
    const edited = { ...card, body: "The user rewrote this." };
    const record = createOperationRecord({
      commandName: "ask",
      workspaceId: "w",
      createdCardIds: [card.id],
      createdCardSnapshots: [card],
      startedAt: Date.now(),
      summary: "1 created",
    });

    expect(canUndoCreate(record, [edited])).toBe(false);
  });

  it("should refuse when the card no longer exists", () => {
    const card = createCard({ id: "c1", workspaceId: "w", type: "chunk", title: "T", body: "B" });
    const record = createOperationRecord({
      commandName: "ask",
      workspaceId: "w",
      createdCardIds: [card.id],
      createdCardSnapshots: [card],
      startedAt: Date.now(),
      summary: "1 created",
    });

    expect(canUndoCreate(record, [])).toBe(false);
  });
});
