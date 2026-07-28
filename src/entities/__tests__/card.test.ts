import { describe, expect, it } from "bun:test";
import { createCard } from "../card";
import { isSchedulable, BUILTIN_CARD_TYPES } from "../cardTypeDefinition";
import { createProvenance } from "../provenance";

describe("Card Entity Factory & Schedulable Eligibility", () => {
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

  it("should support documentGroupFor field when creating a document container group", () => {
    const groupCard = createCard({
      workspaceId: "ws-123",
      type: "group",
      title: "Article Title",
      body: "",
      documentGroupFor: "src-card-id",
    });

    expect(groupCard.documentGroupFor).toBe("src-card-id");
  });

  it("should evaluate isSchedulable correctly based on learning behavior", () => {
    const noteCard = createCard({ workspaceId: "w", type: "note", title: "Note", body: "Text" });
    const sourceCard = createCard({ workspaceId: "w", type: "source", title: "Source", body: "URL" });
    const questionCard = createCard({ workspaceId: "w", type: "question", title: "Q?", body: "A" });
    const clozeCard = createCard({ workspaceId: "w", type: "cloze", title: "C", body: "{{blank}}" });
    const elaborationCard = createCard({ workspaceId: "w", type: "elaboration", title: "E", body: "Explain" });

    // Notes and Sources are working memory / reference material — learning behavior is "none"
    expect(isSchedulable(noteCard, BUILTIN_CARD_TYPES)).toBe(false);
    expect(isSchedulable(sourceCard, BUILTIN_CARD_TYPES)).toBe(false);

    // Question, Cloze, and Elaboration cards are intentional study material
    expect(isSchedulable(questionCard, BUILTIN_CARD_TYPES)).toBe(true);
    expect(isSchedulable(clozeCard, BUILTIN_CARD_TYPES)).toBe(true);
    expect(isSchedulable(elaborationCard, BUILTIN_CARD_TYPES)).toBe(true);
  });

  it("should leave role and provenance unset when omitted (backwards compatible)", () => {
    const card = createCard({ workspaceId: "w", type: "note", title: "N", body: "B" });

    expect(card.role).toBeUndefined();
    expect(card.provenance).toBeUndefined();
  });

  it("should carry an optional semantic role independent of type/typeId", () => {
    const card = createCard({ workspaceId: "w", type: "question", title: "Q", body: "", role: "task" });

    // Role is descriptive only — it must not change the card's type or study eligibility.
    expect(card.role).toBe("task");
    expect(card.type).toBe("question");
    expect(isSchedulable(card, BUILTIN_CARD_TYPES)).toBe(true);
  });

  it("should carry an optional provenance record describing how the card was created", () => {
    const provenance = createProvenance({ mode: "search", searchQuery: "FSRS algorithm" });
    const card = createCard({
      workspaceId: "w",
      type: "source",
      title: "FSRS overview",
      body: "...",
      provenance,
    });

    expect(card.provenance?.mode).toBe("search");
    expect(card.provenance?.searchQuery).toBe("FSRS algorithm");
  });
});
