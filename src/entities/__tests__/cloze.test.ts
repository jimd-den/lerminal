import { describe, expect, it } from "bun:test";
import {
  parseClozeTemplate,
  normalizeAnswer,
  answerMatches,
  readClozeCard,
  isClozeCard,
  ClozeBlank,
} from "../cloze";
import { createCard } from "../card";

/**
 * # Inline Cloze Model Unit Tests
 *
 * ## Business Value & Rationale
 * Validates that template parsing, answer normalization, inline blank evaluation, cloze card
 * detection (`isClozeCard`), and legacy card backwards compatibility function correctly.
 */
describe("Inline Cloze Domain Logic", () => {
  it("parseClozeTemplate should split template into ordered text and blank tokens", () => {
    const template = "The {{c1}} uses a {{c2}} depth buffer to reject hidden fragments.";
    const parts = parseClozeTemplate(template);

    expect(parts).toEqual([
      { kind: "text", value: "The " },
      { kind: "blank", id: "c1" },
      { kind: "text", value: " uses a " },
      { kind: "blank", id: "c2" },
      { kind: "text", value: " depth buffer to reject hidden fragments." },
    ]);
  });

  it("normalizeAnswer should trim, lowercase, strip punctuation, and compress whitespace", () => {
    expect(normalizeAnswer("  GPU!  ")).toBe("gpu");
    expect(normalizeAnswer("hierarchical--depth")).toBe("hierarchical-depth");
    expect(normalizeAnswer("  Deep    Learning  ")).toBe("deep learning");
  });

  it("answerMatches should evaluate typed text against primary and accepted answers", () => {
    const blank: ClozeBlank = {
      id: "c1",
      answer: "GPU",
      acceptedAnswers: ["Graphics Processing Unit", "graphics card"],
    };

    expect(answerMatches("gpu", blank)).toBe(true);
    expect(answerMatches("  Graphics Processing Unit! ", blank)).toBe(true);
    expect(answerMatches("graphics card", blank)).toBe(true);
    expect(answerMatches("CPU", blank)).toBe(false);
    expect(answerMatches("", blank)).toBe(false);
  });

  it("isClozeCard should identify cloze cards regardless of whether type is question or cloze", () => {
    const cloze1 = createCard({ workspaceId: "w", type: "question", typeId: "cloze", title: "T", body: "" });
    const cloze2 = createCard({ workspaceId: "w", type: "question", title: "T", body: "", fields: { template: "a {{c1}} b", blanks: "[]" } });
    const cloze3 = createCard({ workspaceId: "w", type: "question", title: "Prompt with _____ blank", body: "" });
    const question = createCard({ workspaceId: "w", type: "question", title: "What is X?", body: "", answer: "Y" });

    expect(isClozeCard(cloze1)).toBe(true);
    expect(isClozeCard(cloze2)).toBe(true);
    expect(isClozeCard(cloze3)).toBe(true);
    expect(isClozeCard(question)).toBe(false);
  });

  it("readClozeCard should parse structured fields for modern cloze cards", () => {
    const card = createCard({
      workspaceId: "ws-cloze",
      type: "question",
      typeId: "cloze",
      title: "GPU Depth Buffer",
      body: "",
      fields: {
        template: "The {{c1}} uses a {{c2}} depth buffer.",
        blanks: JSON.stringify([
          { id: "c1", answer: "GPU" },
          { id: "c2", answer: "hierarchical" },
        ]),
      },
      answer: "The GPU uses a hierarchical depth buffer.",
    });

    const data = readClozeCard(card);
    expect(data.isLegacy).toBe(false);
    expect(data.template).toBe("The {{c1}} uses a {{c2}} depth buffer.");
    expect(data.blanks).toHaveLength(2);
    expect(data.blanks[0].answer).toBe("GPU");
    expect(data.blanks[1].answer).toBe("hierarchical");
  });

  it("readClozeCard should gracefully convert legacy cloze cards without breaking", () => {
    const legacyCard = createCard({
      workspaceId: "ws-cloze",
      type: "question",
      typeId: "cloze",
      title: "Mitochondria are the _____ of the _____ cell.",
      body: "",
      answer: "powerhouse, eukaryotic",
    });

    const data = readClozeCard(legacyCard);
    expect(data.isLegacy).toBe(true);
    expect(data.template).toBe("Mitochondria are the {{c1}} of the {{c2}} cell.");
    expect(data.blanks).toHaveLength(2);
    expect(data.blanks[0].answer).toBe("powerhouse");
    expect(data.blanks[1].answer).toBe("eukaryotic");
  });
});
