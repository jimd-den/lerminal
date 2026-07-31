/**
 * # Appearance — the console you're allowed to build
 *
 * ## Business Value & Purpose
 * A DOS terminal was never one look: it was a *character grid* you dressed however your
 * phosphor and your taste allowed. Amber, green, IBM's CGA cyan — all the same machine.
 * This module treats that as the product's position on customisation: the app ships a
 * console, and the palette and typeface inside it belong to the user.
 *
 * ## What is customisable, and what isn't
 * Colour and typeface are yours. *Meaning* is not — an accent still marks a semantic
 * role, a warning is still a warning, and no palette may make those indistinguishable.
 * That is why palettes are declared as complete, curated sets with a contrast intent
 * rather than a pile of free-form colour pickers: a user can pick a different instrument,
 * not dismantle the one they have. (Nintendo would let you choose your controller shell,
 * not remap what the A button means.)
 */

import { FontFormat } from "./fontCatalog";

/** A font the app can render with, and where it came from. */
export interface FontChoice {
  /** The family name passed to `fontFamily`. */
  family: string;
  /**
   * `system` fonts are always available. `google` fonts were downloaded at runtime and
   * must be loaded before use — see `FontGateway` / the install interactor.
   */
  source: "system" | "google";
  /** The remote file the family was loaded from, for `google` fonts only. */
  uri?: string;
  /**
   * The container format that was actually downloaded. Optional so that fonts installed
   * before this was recorded still load — an unknown format is simply not re-checked.
   */
  format?: FontFormat;
}

/** The platform default monospace — the console's native voice. */
export const SYSTEM_MONO: FontChoice = { family: "__system_mono__", source: "system" };
/** The platform default UI face, used for reading-length prose. */
export const SYSTEM_SANS: FontChoice = { family: "__system_sans__", source: "system" };

export function isSystemFont(font: FontChoice): boolean {
  return font.source === "system";
}

/**
 * A complete colour set. Every field is required: a palette that leaves gaps invites the
 * caller to invent a colour, which is how "amber terminal" ends up with one stray blue
 * button in it.
 */
export interface Palette {
  id: string;
  /** Shown in settings. */
  label: string;
  /** One line on where the look comes from — customisation should teach, not just toggle. */
  provenance: string;
  mode: "dark" | "light";
  background: string;
  panel: string;
  panelStrong: string;
  panelMuted: string;
  text: string;
  textMuted: string;
  textFaint: string;
  line: string;
  accent: string;
  accentInk: string;
  danger: string;
  warning: string;
}

/**
 * The shipped palettes. The first three are period-accurate phosphor and CGA sets — the
 * DOS heritage the console is styled after; the last two are the modern dark/light pair
 * for people who'd rather read than reminisce.
 *
 * Each keeps `danger` and `warning` legible against its own background even when the
 * accent is monochrome, because a red that vanishes into green phosphor is a bug wearing
 * a costume.
 */
export const PALETTES: Palette[] = [
  {
    id: "amber",
    label: "Amber Phosphor",
    provenance: "Monochrome amber CRTs, the classic late-night terminal",
    mode: "dark",
    background: "#0B0700",
    panel: "#161005",
    panelStrong: "#1F1607",
    panelMuted: "#120C03",
    text: "#FFC96B",
    textMuted: "#C29141",
    textFaint: "#8A6529",
    line: "#3D2C0E",
    accent: "#FFB000",
    accentInk: "#0B0700",
    danger: "#FF6B4A",
    warning: "#FFD866",
  },
  {
    id: "green",
    label: "Green Phosphor",
    provenance: "P1 phosphor, the original glass teletype glow",
    mode: "dark",
    background: "#000F00",
    panel: "#04180A",
    panelStrong: "#06210F",
    panelMuted: "#031206",
    text: "#8FFF8F",
    textMuted: "#5FBF63",
    textFaint: "#3D8A42",
    line: "#0F3A16",
    accent: "#33FF66",
    accentInk: "#000F00",
    danger: "#FF6B6B",
    warning: "#FFE066",
  },
  {
    id: "cga",
    label: "CGA",
    provenance: "IBM CGA's high-intensity cyan and magenta on black",
    mode: "dark",
    background: "#000000",
    panel: "#0A0A18",
    panelStrong: "#12122A",
    panelMuted: "#080810",
    text: "#FFFFFF",
    textMuted: "#AAAAAA",
    textFaint: "#767690",
    line: "#2A2A50",
    accent: "#55FFFF",
    accentInk: "#000000",
    danger: "#FF5555",
    warning: "#FFFF55",
  },
  {
    id: "console",
    label: "Console",
    provenance: "The app's default — a calm dark instrument panel",
    mode: "dark",
    background: "#090E13",
    panel: "#101820",
    panelStrong: "#17232C",
    panelMuted: "#0D141A",
    text: "#F2F6F1",
    textMuted: "#A7B6B5",
    textFaint: "#637574",
    line: "#26363D",
    accent: "#63E6D5",
    accentInk: "#06110F",
    danger: "#FF5F69",
    warning: "#FFB45B",
  },
  {
    id: "paper",
    label: "Paper",
    provenance: "High-contrast light, for daylight and tired eyes",
    mode: "light",
    background: "#EEF1EC",
    panel: "#FBFCF7",
    panelStrong: "#FFFFFF",
    panelMuted: "#E4E9E2",
    text: "#131A1A",
    textMuted: "#4A5654",
    textFaint: "#6B7874",
    line: "#C2CCC6",
    accent: "#0F7A6C",
    accentInk: "#FFFFFF",
    danger: "#B3261E",
    warning: "#8A5A00",
  },
];

export const DEFAULT_PALETTE_ID = "console";

export function findPalette(id: string | undefined): Palette {
  return PALETTES.find(palette => palette.id === id) ?? PALETTES.find(p => p.id === DEFAULT_PALETTE_ID)!;
}

/**
 * The user's full appearance choice. Optional throughout and resolved by
 * {@link resolveAppearance}, so a settings blob written before this feature existed loads
 * as the default console rather than a crash or a blank screen.
 */
export interface AppearanceSettings {
  paletteId?: string;
  /** Overrides the palette's accent when set — the one free-form colour choice. */
  accentOverride?: string;
  monoFont?: FontChoice;
  sansFont?: FontChoice;
  /** Fonts the user has installed, kept so they can be re-loaded on next launch. */
  installedFonts?: FontChoice[];
}

export interface ResolvedAppearance {
  palette: Palette;
  accent: string;
  monoFont: FontChoice;
  sansFont: FontChoice;
  installedFonts: FontChoice[];
}

/** A hex colour the accent override will accept — anything else is ignored, not guessed. */
export const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function resolveAppearance(settings: AppearanceSettings | undefined): ResolvedAppearance {
  const palette = findPalette(settings?.paletteId);
  const override = settings?.accentOverride;
  return {
    palette,
    accent: override && HEX_COLOR_PATTERN.test(override) ? override : palette.accent,
    monoFont: settings?.monoFont ?? SYSTEM_MONO,
    sansFont: settings?.sansFont ?? SYSTEM_SANS,
    installedFonts: settings?.installedFonts ?? [],
  };
}
