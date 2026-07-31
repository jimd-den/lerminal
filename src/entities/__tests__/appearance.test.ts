import { describe, expect, it } from "bun:test";
import {
  DEFAULT_PALETTE_ID,
  PALETTES,
  SYSTEM_MONO,
  SYSTEM_SANS,
  SURFACE_TINTS,
  applySurfaceTint,
  findPalette,
  resolveAppearance,
} from "../appearance";

describe("PALETTES", () => {
  it("ships the DOS-heritage sets, the mission console, and a modern dark/light pair", () => {
    expect(PALETTES.map(p => p.id)).toEqual([
      "proof",
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
  it("resolves settings written before this feature existed to the default palette", () => {
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
    // Reads the default rather than naming a palette, so changing which palette ships
    // as the default doesn't fail a test about override validation.
    const fallback = PALETTES.find(p => p.id === DEFAULT_PALETTE_ID)!;

    expect(resolveAppearance({ accentOverride: "not-a-color" }).accent).toBe(fallback.accent);
    expect(resolveAppearance({ accentOverride: "" }).accent).toBe(fallback.accent);
  });

  it("carries installed fonts through so they can be re-loaded next launch", () => {
    const font = { family: "JetBrains Mono", source: "google" as const, uri: "https://x/f.ttf" };

    expect(resolveAppearance({ installedFonts: [font] }).installedFonts).toEqual([font]);
  });

  it("resolves surfaceTint/density/motion/highContrast to today's behaviour when unset", () => {
    const resolved = resolveAppearance(undefined);

    expect(resolved.surfaceTint).toBe("neutral");
    expect(resolved.density).toBe("standard");
    expect(resolved.motion).toBe("system");
    expect(resolved.highContrast).toBe(false);
  });

  it("round-trips an explicit surface tint, density, motion, and high contrast", () => {
    const resolved = resolveAppearance({
      surfaceTint: "graphite",
      density: "compact",
      motion: "reduced",
      highContrast: true,
    });

    expect(resolved.surfaceTint).toBe("graphite");
    expect(resolved.density).toBe("compact");
    expect(resolved.motion).toBe("reduced");
    expect(resolved.highContrast).toBe(true);
  });
});

describe("applySurfaceTint", () => {
  const base = PALETTES.find(p => p.id === "proof")!;

  it("leaves the palette untouched for neutral", () => {
    expect(applySurfaceTint(base, "neutral")).toEqual(base);
  });

  it("overrides only the neutrals, never the semantic colours", () => {
    const tinted = applySurfaceTint(base, "graphite");

    expect(tinted.background).not.toBe(base.background);
    expect(tinted.panel).not.toBe(base.panel);
    // Every semantic colour must survive a tint unchanged — that's the whole boundary.
    expect(tinted.accent).toBe(base.accent);
    expect(tinted.accentInk).toBe(base.accentInk);
    expect(tinted.danger).toBe(base.danger);
    expect(tinted.warning).toBe(base.warning);
    expect(tinted.evidence).toBe(base.evidence);
    expect(tinted.text).toBe(base.text);
    expect(tinted.textMuted).toBe(base.textMuted);
    expect(tinted.textFaint).toBe(base.textFaint);
  });

  it("applies through resolveAppearance end to end", () => {
    const resolved = resolveAppearance({ paletteId: "proof", surfaceTint: "blue-black" });

    expect(resolved.palette.background).toBe(SURFACE_TINTS["blue-black"]!.background);
    expect(resolved.palette.accent).toBe(base.accent);
  });

  it("keeps every tint's neutrals distinguishable from its own semantic colours", () => {
    // A tint that happened to land a neutral on top of, say, the warning colour would
    // silently make a caution card unreadable against its own background.
    for (const tint of Object.keys(SURFACE_TINTS) as (keyof typeof SURFACE_TINTS)[]) {
      const tinted = applySurfaceTint(base, tint);
      const semantics = [tinted.danger, tinted.warning, tinted.evidence, tinted.accent];
      expect(semantics).not.toContain(tinted.background);
      expect(semantics).not.toContain(tinted.panelStrong);
    }
  });
});
