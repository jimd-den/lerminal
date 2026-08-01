import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const griotDir = path.join(__dirname, "..");
const read = (relative: string) =>
  fs.readFileSync(path.join(griotDir, relative), "utf-8");

/**
 * Retiring `SystemHeader` (the old LCARS-style header — `headerRail`/`headerRailCut`
 * elbow, `SYS // 01`/`READY` mono labels) in favour of the compact brand-header style
 * (`brandRow`/`brandSub`) used by Capture/Deck/Library. These structural checks pin
 * that every consumer actually migrated, and that the functional content each header
 * carried — back navigation, capture action, ready/status labels — survived the move.
 */

const noLcarsMarkers = (source: string) => {
  expect(source).not.toContain("SystemHeader");
  expect(source).not.toContain("headerRail");
  expect(source).not.toContain("headerRailCut");
};

describe("SettingsScreen — migrated off SystemHeader", () => {
  const source = read("SettingsScreen.tsx");

  it("no longer renders the LCARS SystemHeader", () => {
    noLcarsMarkers(source);
  });

  it("renders the compact brand-row header instead", () => {
    expect(source).toContain("localStyles.brandRow");
    expect(source).toContain("localStyles.brandSub");
    expect(source).toContain("Machine configuration");
  });
});

describe("DocumentScreen — migrated off SystemHeader", () => {
  const source = read("screens/DocumentScreen.tsx");

  it("no longer renders the LCARS SystemHeader", () => {
    noLcarsMarkers(source);
  });

  it("renders the compact brand-row header instead", () => {
    expect(source).toContain("localStyles.brandRow");
    expect(source).toContain("localStyles.brandSub");
  });

  it("keeps the back-to-space action wired to onBack", () => {
    expect(source).toContain("onPress={onBack}");
    expect(source).toContain("SPACE");
  });

  it("keeps the document actions toggle wired to the same state", () => {
    expect(source).toContain('onPress={() => setActionsOpen((open) => !open)}');
    expect(source).toContain('{actionsOpen ? "CLOSE" : "+ ACTION"}');
  });
});

describe("LibraryScreen — already on the compact brand header", () => {
  const source = read("screens/LibraryScreen.tsx");

  it("carries no LCARS markers", () => {
    noLcarsMarkers(source);
  });

  it("renders the brand-row/brandSub pattern", () => {
    expect(source).toContain("localStyles.brandRow");
    expect(source).toContain("localStyles.brandSub");
  });
});

describe("SpaceScreen — bespoke top bar migrated to the brand-row pattern", () => {
  const source = read("screens/SpaceScreen.tsx");

  it("carries no LCARS markers", () => {
    noLcarsMarkers(source);
  });

  it("renders the shared brand-row pattern rather than a bespoke centered title", () => {
    expect(source).toContain("localStyles.brandRow");
    expect(source).toContain("localStyles.brandDot");
  });

  it("keeps back-to-library navigation wired to onBack", () => {
    expect(source).toContain("onPress={onBack}");
    expect(source).toContain("LIBRARY");
  });

  it("keeps the capture affordance wired to onCapture(\"note\")", () => {
    expect(source).toContain('onPress={() => onCapture("note")}');
    expect(source).toContain("+ ADD");
  });
});

describe("SystemHeader — retired", () => {
  it("has zero remaining call sites or definition anywhere under src", () => {
    const root = path.join(__dirname, "../../../../..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (full === __filename) continue;
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
          const contents = fs.readFileSync(full, "utf-8");
          if (contents.includes("SystemHeader")) offenders.push(full);
        }
      }
    };
    walk(path.join(root, "src"));
    // The only remaining mentions should be prose references (e.g. brand.ts's doc
    // comment for a still-existing helper name), never an import or JSX usage.
    const codeOffenders = offenders.filter((file) => {
      const contents = fs.readFileSync(file, "utf-8");
      return /import[^\n]*SystemHeader|<SystemHeader|export function SystemHeader/.test(contents);
    });
    expect(codeOffenders).toEqual([]);
  });
});
