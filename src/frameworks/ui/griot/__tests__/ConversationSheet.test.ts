import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const read = (relative: string) =>
  fs.readFileSync(path.join(__dirname, "..", relative), "utf-8");

const sheet = read("ConversationSheet.tsx");

/** The disclosure component's own source, so assertions can't be satisfied elsewhere. */
const slice = (start: string, end: string) =>
  sheet.slice(sheet.indexOf(start), sheet.indexOf(end));

/**
 * Structural assertions about the sheet, in the same spirit as `MainLayout.test.tsx`:
 * they pin the guarantees a rendering test would be too coarse to protect — that the
 * disclosure shows only what was really sent, that reasoning UI exists only where real
 * reasoning does, and that the inline action link cannot dispatch.
 */
describe("conversation sheet — turn disclosure", () => {
  const disclosure = slice("function TurnDisclosure", "function InlineAction");

  it("renders nothing without a real sent-context record", () => {
    expect(disclosure).toContain("if (!sentContext) return null;");
  });

  it("shows the ids and the verbatim briefing that were sent, not a summary", () => {
    expect(disclosure).toContain("sentContext.cards.map");
    expect(disclosure).toContain("{sentContext.briefing}");
    // Truth comes from the projection, which comes from the workflow's send-time record.
    expect(disclosure).not.toContain("slice(");
  });

  it("is collapsed by default and reports its expanded state", () => {
    expect(disclosure).toContain("useState(false)");
    expect(disclosure).toContain("accessibilityState={{ expanded: open }}");
  });

  it("renders reasoning only when reasoning is present, and never as the answer", () => {
    expect(disclosure).toContain("{reasoning ? (");
    expect(disclosure).toContain("THE MODEL'S OWN THINKING — NOT ITS ANSWER");
    // No placeholder for the common case of a model that returned none.
    expect(disclosure).not.toMatch(/no reasoning|not available|thinking\.\.\./i);
  });

  it("carries no raw hex colours", () => {
    expect(disclosure).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("conversation sheet — inline tag chips", () => {
  const chip = slice("function TagChip", "function SourceReceipts");

  it("the chip's + is the only thing that can create anything", () => {
    expect(chip).toContain("controller.addWorkspaceAgentTag(tag.messageId, tag.id)");
    // Exactly one dispatch call site in the whole sheet: rendering, streaming and
    // parsing a tag must all remain incapable of changing the workspace.
    expect(sheet.match(/controller\.addWorkspaceAgentTag\(/g)).toHaveLength(1);
  });

  it("offers no + for a tag that resolved to nothing", () => {
    // An unresolvable card reference or a malformed link has no intent to dispatch, so
    // its + must be disabled rather than presenting an affordance that does nothing.
    expect(chip).toContain("const disabled = !tag.canAdd");
    expect(chip).toContain("disabled={disabled}");
  });

  it("renders tags inline, in the prose, rather than as a separate proposal slab", () => {
    expect(sheet).toContain("message.segments.map");
    expect(sheet).toContain('segment.kind === "text"');
  });

  it("keeps the composer's thinking spinner and the citation strip", () => {
    expect(sheet).toContain("view.isThinking");
    expect(sheet).toContain("ActivityIndicator");
    expect(sheet).toContain("SOURCES THE MODEL CONSULTED");
  });

  it("keeps the scroll fixes that made proposals reachable", () => {
    // Regressing either of these puts content back under the composer, untappable.
    expect(sheet).toContain('keyboardShouldPersistTaps="handled"');
    expect(sheet).toContain("flexShrink: 1");
  });
});
