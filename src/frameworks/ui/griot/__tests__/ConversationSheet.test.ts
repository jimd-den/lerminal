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

describe("conversation sheet — inline action links", () => {
  const inline = slice("function InlineAction", "function ProposalCard");

  it("expanding is local state only — the link itself dispatches nothing", () => {
    expect(inline).toContain("setOpen");
    expect(inline).not.toContain("confirmWorkspaceAgentAction");
    expect(inline).not.toContain("toggleWorkspaceAgentProposalItem");
  });

  it("expands into the same inspectable proposal card", () => {
    expect(inline).toContain("<ProposalCard");
    expect(inline).toContain("Nothing runs until you confirm it.");
  });

  it("keeps CONFIRM as the only path to a dispatch", () => {
    const card = slice("function ProposalCard", "The receipts strip");
    expect(card).toContain("controller.confirmWorkspaceAgentAction(proposal.id)");
    // Exactly one dispatch call site in the whole sheet.
    expect(sheet.match(/controller\.confirmWorkspaceAgentAction\(/g)).toHaveLength(1);
  });

  it("renders inline links per message, and free-floating cards only for detached ones", () => {
    expect(sheet).toContain("message.proposals.map");
    expect(sheet).toContain("view.detachedProposals.map");
  });

  it("keeps the composer's thinking spinner and the citation strip", () => {
    expect(sheet).toContain("view.isThinking");
    expect(sheet).toContain("ActivityIndicator");
    expect(sheet).toContain("SOURCES THE MODEL CONSULTED");
  });
});
