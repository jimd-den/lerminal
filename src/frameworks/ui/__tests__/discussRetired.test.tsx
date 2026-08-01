import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const uiRoot = path.join(__dirname, "..");
const read = (relative: string) =>
  fs.readFileSync(path.join(uiRoot, relative), "utf-8");

/**
 * Architecture assertions for the retirement of the per-card "Discuss" surface: the
 * document screen no longer offers a third conversational mode, chat cards render as a
 * read-only archive, and the affordance that replaced Discuss points at the workspace
 * agent so the document context is not left without an AI entry point.
 */
describe("DocumentScreen after discuss retirement", () => {
  const content = read("griot/screens/DocumentScreen.tsx");

  it("offers only the read and study modes", () => {
    expect(content).toContain('useState<"read" | "study">("read")');
    expect(content).toContain('(["read", "study"] as const)');
    expect(content).not.toContain("discuss");
  });

  it("replaces the discuss action with an entry point to the workspace agent", () => {
    expect(content).toContain("controller.openWorkspaceAgent()");
    expect(content).toContain("Ask GRIOT");
    expect(content).not.toContain("Discuss");
    // The old action dispatched the retired `chat` pipeline command.
    expect(content).not.toContain("chat \"");
  });
});

describe("chat cards in the detail modal", () => {
  const content = read("griot/CardDetailModal.tsx");

  it("renders a saved conversation without a composer or send path", () => {
    expect(content).toContain("function ChatDetail");
    expect(content).not.toContain("sendChatMessage");
    expect(content).not.toContain("MESSAGE CHANNEL");
    expect(content).not.toContain("chatStreamingCardId");
  });

  it("points the reader at the workspace agent instead", () => {
    expect(content).toContain("ASK GRIOT");
    expect(content).toContain("controller.openWorkspaceAgent()");
  });
});
