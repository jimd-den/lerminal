import { describe, expect, it } from "bun:test";
import {
  presentCaptureReceipt,
  presentSelectionTray,
} from "../CaptureReceiptPresenter";
import { createCard } from "../../../entities/card";
import { BUILTIN_CARD_TYPES } from "../../../entities/cardTypeDefinition";

function baseState(overrides: any = {}) {
  return {
    workspaces: [{ id: "ws-1", name: "WebGPU" }],
    activeWorkspaceId: "ws-1",
    cards: [],
    currentGroupId: null,
    selection: new Set<string>(),
    cardTypes: BUILTIN_CARD_TYPES,
    operationResult: null,
    gapReport: null,
    ...overrides,
  };
}

describe("presentCaptureReceipt", () => {
  it("returns null when nothing has been created", () => {
    expect(presentCaptureReceipt(baseState() as any)).toBeNull();
  });

  it("names the containing group as the destination when the output landed in one", () => {
    const group = createCard({ id: "g1", workspaceId: "ws-1", type: "group", title: "React Hooks", body: "" });
    const note = createCard({ id: "n1", workspaceId: "ws-1", type: "note", title: "N", body: "B", parentId: "g1" });
    const state = baseState({
      cards: [group, note],
      operationResult: {
        summary: "Note captured",
        createdCardIds: ["n1"],
        destination: { spaceId: "ws-1", groupId: "g1" },
        primaryActionLabel: "Open note",
      },
    });

    const receipt = presentCaptureReceipt(state as any)!;

    expect(receipt.destinationLabel).toBe("React Hooks");
  });

  it("falls back to the workspace name at the root, never a raw id", () => {
    const note = createCard({ id: "n1", workspaceId: "ws-1", type: "note", title: "N", body: "B" });
    const state = baseState({
      cards: [note],
      operationResult: {
        summary: "Note captured",
        createdCardIds: ["n1"],
        destination: { spaceId: "ws-1" },
        primaryActionLabel: "Open note",
      },
    });

    const receipt = presentCaptureReceipt(state as any)!;

    expect(receipt.destinationLabel).toBe("WebGPU");
  });

  it("derives next actions from the created card's role", () => {
    const source = createCard({ id: "s1", workspaceId: "ws-1", type: "source", title: "S", body: "B" });
    const state = baseState({
      cards: [source],
      operationResult: {
        summary: "Source added",
        createdCardIds: ["s1"],
        destination: { spaceId: "ws-1" },
        primaryActionLabel: "Open",
      },
    });

    const receipt = presentCaptureReceipt(state as any)!;

    expect(receipt.nextActions.map(a => a.id)).toContain("extract-ideas");
  });

  it("omits 'Attach to mission' when the workspace has no mission", () => {
    const note = createCard({ id: "n1", workspaceId: "ws-1", type: "note", title: "N", body: "B" });
    const state = baseState({
      cards: [note],
      gapReport: { hasMission: false, successCriteria: [] },
      operationResult: {
        summary: "Note captured",
        createdCardIds: ["n1"],
        destination: { spaceId: "ws-1" },
        primaryActionLabel: "Open",
      },
    });

    const receipt = presentCaptureReceipt(state as any)!;

    expect(receipt.nextActions.map(a => a.id)).not.toContain("attach-mission");
  });

  it("warns when the output came from a local template rather than a model", () => {
    const card = createCard({
      id: "n1", workspaceId: "ws-1", type: "chunk", title: "N", body: "B",
      provenance: { mode: "agent", createdAt: 1, isLocalFallback: true },
    });
    const state = baseState({
      cards: [card],
      operationResult: {
        summary: "1 chunk created",
        createdCardIds: ["n1"],
        destination: { spaceId: "ws-1" },
        primaryActionLabel: "Open",
      },
    });

    const receipt = presentCaptureReceipt(state as any)!;

    expect(receipt.localFallbackReason).toContain("local template");
  });

  it("stays silent when a model genuinely answered", () => {
    const card = createCard({
      id: "n1", workspaceId: "ws-1", type: "chunk", title: "N", body: "B",
      provenance: { mode: "agent", createdAt: 1 },
    });
    const state = baseState({
      cards: [card],
      operationResult: {
        summary: "1 chunk created",
        createdCardIds: ["n1"],
        destination: { spaceId: "ws-1" },
        primaryActionLabel: "Open",
      },
    });

    expect(presentCaptureReceipt(state as any)!.localFallbackReason).toBeNull();
  });

  it("reports that the selection moved when the created cards are now selected", () => {
    const note = createCard({ id: "n1", workspaceId: "ws-1", type: "note", title: "N", body: "B" });
    const state = baseState({
      cards: [note],
      selection: new Set(["n1"]),
      operationResult: {
        summary: "Note captured",
        createdCardIds: ["n1"],
        destination: { spaceId: "ws-1" },
        primaryActionLabel: "Open",
      },
    });

    expect(presentCaptureReceipt(state as any)!.selectionChanged).toBe(true);
  });

  it("silently drops created cards that no longer exist, so a stale receipt can't dangle", () => {
    const state = baseState({
      cards: [],
      operationResult: {
        summary: "1 item created",
        createdCardIds: ["deleted-id"],
        destination: { spaceId: "ws-1" },
        primaryActionLabel: "Open",
      },
    });

    const receipt = presentCaptureReceipt(state as any)!;

    expect(receipt.createdCards).toEqual([]);
    expect(receipt.nextActions).toEqual([]);
  });
});

describe("presentSelectionTray", () => {
  it("counts the cards a command would actually receive, expanding a selected group", () => {
    const group = createCard({ id: "g1", workspaceId: "ws-1", type: "group", title: "G", body: "" });
    const child = createCard({ id: "c1", workspaceId: "ws-1", type: "note", title: "C", body: "B", parentId: "g1" });
    const grandchild = createCard({ id: "c2", workspaceId: "ws-1", type: "note", title: "D", body: "B", parentId: "c1" });
    const state = baseState({ cards: [group, child, grandchild], selection: new Set(["g1"]) });

    // One card is selected, but three would be piped — the tray must say three.
    expect(presentSelectionTray(state as any).count).toBe(3);
  });

  it("always exposes the same five actions regardless of selection", () => {
    const ids = presentSelectionTray(baseState() as any).actions.map(a => a.id);

    expect(ids).toEqual(["explain", "research", "connect", "study", "more"]);
  });

  it("reports study eligibility from the card-type registry", () => {
    const note = createCard({ id: "n1", workspaceId: "ws-1", type: "note", title: "N", body: "B" });
    const question = createCard({ id: "q1", workspaceId: "ws-1", type: "question", title: "Q", body: "", answer: "A" });

    expect(presentSelectionTray(baseState({ cards: [note], selection: new Set(["n1"]) }) as any).canEnrollInStudy).toBe(false);
    expect(presentSelectionTray(baseState({ cards: [question], selection: new Set(["q1"]) }) as any).canEnrollInStudy).toBe(true);
  });
});
