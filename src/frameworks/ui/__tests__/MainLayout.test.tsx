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

  it("composes the four places from the screens module", () => {
    expect(content).toContain("DeckScreen");
    expect(content).toContain("LibraryScreen");
    expect(content).toContain("SpaceScreen");
    expect(content).toContain("DocumentScreen");
    expect(content).toContain("CaptureScreen");
    expect(content).toContain("SettingsScreen");
    expect(content).toContain("BottomNavigation");
    expect(content).not.toContain("LegacyMainLayout");
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
    const content = read("learningDeck/ModalStack.tsx");

    for (const modal of [
      "CardDetailModal",
      "ReviewModal",
      "CommandConsoleModal",
      "AiPreflightSheet",
      "ResearchResultsSheet",
      "MissionEditorSheet",
      "GapReportSheet",
      "PendingInputModal",
    ]) {
      expect(content).toContain(modal);
    }
  });
});

describe("screens module", () => {
  it("is split one file per screen, not a single omnibus file", () => {
    expect(fs.existsSync(path.join(uiRoot, "learningDeck/screens.tsx"))).toBe(false);

    for (const file of [
      "DeckScreen.tsx",
      "LibraryScreen.tsx",
      "SpaceScreen.tsx",
      "DocumentScreen.tsx",
      "CaptureScreen.tsx",
    ]) {
      expect(fs.existsSync(path.join(uiRoot, "learningDeck/screens", file))).toBe(true);
    }
  });

  it("keeps every screen small enough to hold in your head", () => {
    const dir = path.join(uiRoot, "learningDeck/screens");
    for (const file of fs.readdirSync(dir)) {
      const lines = fs.readFileSync(path.join(dir, file), "utf-8").split("\n").length;
      expect(lines).toBeLessThan(400);
    }
  });
});
