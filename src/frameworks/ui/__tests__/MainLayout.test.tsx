import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const uiRoot = path.join(__dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(uiRoot, relative), "utf-8");

/**
 * These are architecture assertions, not behaviour tests: they pin *where* responsibility
 * lives so the shell can't quietly re-absorb what once made it a God class — five screens,
 * eight modals, navigation state, and the back-button policy in one file.
 */
describe("MainLayout shell", () => {
  const content = read("MainLayout.tsx");

  it("composes the three places from the screens module", () => {
    expect(content).toContain("DeckScreen");
    expect(content).toContain("LibraryScreen");
    expect(content).toContain("SpaceScreen");
    expect(content).toContain("DocumentScreen");
    expect(content).toContain("SettingsScreen");
    expect(content).toContain("BottomNavigation");
    expect(content).not.toContain("LegacyMainLayout");
  });

  // Capture moved off the routing union entirely — it is a floating modal (see the
  // "Capture affordance" describe block below), not a place the shell switches on.
  it("no longer routes to capture as a place", () => {
    expect(content).not.toContain('nav.place === "capture"');
    expect(content).not.toContain("<CaptureScreen");
  });

  it("delegates navigation and the modal stack rather than owning them", () => {
    expect(content).toContain("useDeckNavigation");
    expect(content).toContain("ModalStack");

    // The back-button policy and place transitions belong to the hook now.
    expect(content).not.toContain("BackHandler");
    expect(content).not.toContain("setLibraryLevel");
    // Individual sheets are mounted by ModalStack, not here.
    expect(content).not.toContain("CardDetailModal");
    expect(content).not.toContain("AiPreflightSheet");
    expect(content).not.toContain("GapReportSheet");
  });

  it("carries no decorative chrome that implies capability", () => {
    // The old instrument grid drew crosshairs over the canvas that meant nothing.
    expect(content).not.toContain("instrumentGrid");
    expect(content).not.toContain("gridNode");
  });
});

describe("modal stack", () => {
  it("mounts every sheet in one place", () => {
    const content = read("griot/ModalStack.tsx");

    for (const modal of [
      "CardDetailModal",
      "ReviewModal",
      "CommandConsoleModal",
      "AiPreflightSheet",
      "ResearchResultsSheet",
      "MissionEditorSheet",
      "GapReportSheet",
      "CaptureSheet",
      "PendingInputModal",
    ]) {
      expect(content).toContain(modal);
    }
  });
});

describe("screens module", () => {
  it("is split one file per screen, not a single omnibus file", () => {
    expect(fs.existsSync(path.join(uiRoot, "griot/screens.tsx"))).toBe(false);

    for (const file of [
      "DeckScreen.tsx",
      "LibraryScreen.tsx",
      "SpaceScreen.tsx",
      "DocumentScreen.tsx",
      "CaptureScreen.tsx",
    ]) {
      expect(fs.existsSync(path.join(uiRoot, "griot/screens", file))).toBe(true);
    }
  });

  it("keeps every screen small enough to hold in your head", () => {
    const dir = path.join(uiRoot, "griot/screens");
    for (const file of fs.readdirSync(dir)) {
      const lines = fs.readFileSync(path.join(dir, file), "utf-8").split("\n").length;
      expect(lines).toBeLessThan(400);
    }
  });
});

/**
 * The assistant needs a way in that does not depend on the Workspace Pulse having
 * something to say. It is an affordance, not a place: `CorePlace` is a routing union, and
 * the conversation is a modal sheet layered over the screen it is scoped to.
 */
describe("Ask affordance", () => {
  const shell = read("MainLayout.tsx");
  const components = read("griot/components.tsx");

  it("is mounted in the shell and opens the conversation", () => {
    expect(shell).toContain("AskAffordance");
    expect(shell).toContain("controller.openWorkspaceAgent()");
  });

  it("is not a fifth navigation place", () => {
    // The routing union now has three members; nothing routes to the agent.
    expect(components).toContain('export type CorePlace = "deck" | "library" | "more";');
    expect(components).not.toContain('id: "agent"');
  });

  it("stands down for the sheet it opens, for the capture sheet, and for the selection tray", () => {
    expect(shell).toContain("!state.workspaceAgent.isOpen && !state.isCaptureSheetOpen && state.selection.size === 0");
  });

  it("is positioned relative to the bottom cluster, not to the nav's items", () => {
    // So the pulse and activity banner push it up rather than being covered by it, and
    // changing how many tabs the bar has cannot strand it.
    expect(shell).toContain("bottomCluster");
    expect(shell).toContain("floatingSlot");
  });

  it("meets the tap-target floor, is labelled, and uses theme tokens", () => {
    expect(components).toContain('accessibilityLabel="Ask GRIOT"');
    expect(components).toMatch(/ask: \{[^}]*minHeight: 5[2-9]/);
    // No raw hex anywhere in the affordance's colours.
    const askBlock = components.slice(
      components.indexOf("export function AskAffordance"),
      components.indexOf("export function BottomNavigation")
    );
    expect(askBlock).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(askBlock).toContain("theme.accent");
    // Press feedback drops the scale transform when motion is reduced.
    expect(askBlock).toContain("reducedMotion");
  });

  it("leaves room for itself at the bottom of scrolled screens", () => {
    const screenStyles = read("griot/screens/screenStyles.ts");
    expect(screenStyles).toMatch(/content: \{[^}]*paddingBottom: 1[0-9][0-9]/);
  });
});

/**
 * Capture used to be a fourth `CorePlace` tab; it is now a floating action paired with
 * Ask, stacked above the nav rather than living in a shrinking set of tab slots.
 */
describe("Capture affordance", () => {
  const shell = read("MainLayout.tsx");
  const components = read("griot/components.tsx");

  it("is mounted in the shell and opens the capture sheet", () => {
    expect(shell).toContain("CaptureAffordance");
    expect(shell).toContain("openCapture(\"note\")");
  });

  it("is not in the bottom nav's items", () => {
    expect(components).not.toContain('id: "capture"');
  });

  it("stands down alongside Ask — both float in the same slot", () => {
    expect(shell).toContain("!state.workspaceAgent.isOpen && !state.isCaptureSheetOpen && state.selection.size === 0");
    expect(shell).toContain("floatingSlot");
  });

  it("is stacked with Ask, not laid out side by side", () => {
    expect(shell).toMatch(/floatingSlot: \{[^}]*alignItems: "flex-end"/);
  });

  it("meets the tap-target floor, is labelled, and uses theme tokens", () => {
    expect(components).toContain('accessibilityLabel="Capture"');
    const captureBlock = components.slice(
      components.indexOf("export function CaptureAffordance")
    );
    expect(captureBlock).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(captureBlock).toContain("theme.accent");
    expect(captureBlock).toContain("reducedMotion");
  });
});
