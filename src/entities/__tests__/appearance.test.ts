import { describe, expect, it } from "bun:test";
import {
  DEFAULT_PALETTE_ID,
  PALETTES,
  SYSTEM_MONO,
  SYSTEM_SANS,
  findPalette,
  resolveAppearance,
} from "../appearance";

describe("PALETTES", () => {
  it("ships the DOS-heritage sets, the mission console, and a modern dark/light pair", () => {
    expect(PALETTES.map(p => p.id)).toEqual([
      "amber",
      "green",
      "cga",
      "console",
      "mission",
      "paper",
    ]);
  });

  it("keeps every semantic state distinguishable in every palette", () => {
    for (const palette of PALETTES) {
      // Warning, danger, and evidence each carry a distinct meaning. A palette that
      // collapses any two of them into one colour makes a caution indistinguishable
      // from an error, or web evidence from the app's own accent.
      const semantic = [palette.danger, palette.warning, palette.evidence, palette.accent];
      const unique = new Set(semantic.map(c => c.toLowerCase()));
      expect(unique.size).toBe(semantic.length);
    }
  });

  it("keeps semantic colours off the palette's own background", () => {
    for (const palette of PALETTES) {
      for (const color of [palette.danger, palette.warning, palette.evidence]) {
        expect(color.toLowerCase()).not.toBe(palette.background.toLowerCase());
      }
    }
  });

  it("gives every palette a complete colour set, so no caller has to invent one", () => {
    const required = [
      "background", "panel", "panelStrong", "panelMuted",
      "text", "textMuted", "textFaint", "line",
      "accent", "accentInk", "danger", "warning",
    ] as const;

    for (const palette of PALETTES) {
      for (const field of required) {
        expect(palette[field]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });

  it("keeps danger distinguishable from the accent in every palette", () => {
    // A red that reads as "just another accent" turns a warning into decoration.
    for (const palette of PALETTES) {
      expect(palette.danger.toLowerCase()).not.toBe(palette.accent.toLowerCase());
    }
  });

  it("explains where each look comes from, so customising teaches something", () => {
    for (const palette of PALETTES) {
      expect(palette.provenance.length).toBeGreaterThan(10);
    }
  });
});

describe("findPalette", () => {
  it("falls back to the default rather than returning undefined", () => {
    expect(findPalette("nonsense").id).toBe(DEFAULT_PALETTE_ID);
    expect(findPalette(undefined).id).toBe(DEFAULT_PALETTE_ID);
  });
});

describe("resolveAppearance", () => {
  it("resolves settings written before this feature existed to the default console", () => {
    const resolved = resolveAppearance(undefined);

    expect(resolved.palette.id).toBe(DEFAULT_PALETTE_ID);
    expect(resolved.monoFont).toEqual(SYSTEM_MONO);
    expect(resolved.sansFont).toEqual(SYSTEM_SANS);
    expect(resolved.installedFonts).toEqual([]);
  });

  it("uses the palette's own accent when no override is set", () => {
    const amber = PALETTES.find(p => p.id === "amber")!;

    expect(resolveAppearance({ paletteId: "amber" }).accent).toBe(amber.accent);
  });

  it("applies a valid hex accent override", () => {
    expect(resolveAppearance({ paletteId: "amber", accentOverride: "#FF00FF" }).accent).toBe("#FF00FF");
    expect(resolveAppearance({ accentOverride: "#0f0" }).accent).toBe("#0f0");
  });

  it("ignores an invalid override instead of guessing at it", () => {
    const console = PALETTES.find(p => p.id === "console")!;

    expect(resolveAppearance({ accentOverride: "not-a-color" }).accent).toBe(console.accent);
    expect(resolveAppearance({ accentOverride: "" }).accent).toBe(console.accent);
  });

  it("carries installed fonts through so they can be re-loaded next launch", () => {
    const font = { family: "JetBrains Mono", source: "google" as const, uri: "https://x/f.ttf" };

    expect(resolveAppearance({ installedFonts: [font] }).installedFonts).toEqual([font]);
  });
});
