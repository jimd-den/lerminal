import { Platform } from "react-native";
import { AppState } from "../../../adapters/presenters/LearnimalController";
import { SemanticRole } from "../../../entities/card";
import {
  AppearanceSettings,
  FontChoice,
  resolveAppearance,
} from "../../../entities/appearance";

export type AccentName = AppState["accent"];

/**
 * # Type Scale — large-format
 *
 * ## Business Value & Purpose
 * The design direction is an LCARS-style mission console by way of Vision Pro's calm
 * depth and Nintendo's chunky, no-manual-needed clarity. All three agree on one thing:
 * **big**. LCARS labels are bold blocks you read across a bridge; Nintendo controls are
 * obvious from the couch; Vision Pro panels are generously spaced because they float in
 * real space. The old styling had drifted the other way into 7, 8, and 9-point labels —
 * legible in a desktop mockup, not on a phone at arm's length.
 *
 * So this scale is deliberately larger than a conventional mobile ramp, with a hard 12pt
 * floor, and each step named for its *job* so the next label added has an obvious size to
 * pick rather than a number someone eyeballed.
 *
 * Six steps is deliberate. A scale with a step for every occasion stops being a scale.
 */
export const TypeScale = {
  /** All-caps system labels, HUD eyebrows, badges. The floor — never go below this. */
  label: 12,
  /** Metadata, IDs, intervals, provenance lines. */
  meta: 13,
  /** Default body text. */
  body: 16,
  /** Emphasised body — card titles in lists, primary buttons. */
  bodyStrong: 18,
  /** Section and card titles. */
  title: 22,
  /** Screen headings. */
  display: 28,
} as const;

/**
 * # Structure Tokens
 *
 * ## Business Value & Purpose
 * The LCARS half of the direction is *structural*: colour-coded rails, blocky panels, and
 * the characteristic asymmetric corner where a rail turns into a panel. These tokens name
 * that vocabulary so panels across the app share one silhouette instead of each
 * re-inventing its radii — which is what makes a set of screens read as one instrument
 * rather than a pile of cards.
 *
 * Touch sizes carry the Nintendo half: `tap` is the 44pt floor, `tapLarge` is what a
 * primary action gets, because the main thing on screen should be unmissable.
 */
export const Structure = {
  /** Width of the colour-coded spine on a panel. */
  rail: 6,
  /** Thicker spine for a primary/mission panel. */
  railBold: 10,
  /** The soft outer radius of a panel. */
  radius: 16,
  /** The tight corner where a rail meets a panel — the LCARS "elbow". */
  radiusElbow: 5,
  /** Inner radius for controls sitting inside a panel. */
  radiusControl: 10,
  /** Minimum touch target. */
  tap: 44,
  /** Primary-action touch target. */
  tapLarge: 56,
  /** Standard gutter inside a panel. */
  gutter: 16,
} as const;

/**
 * # Semantic Role Colors
 *
 * ## Business Value & Purpose
 * Accent colour carries meaning or it carries nothing. These map a card's
 * {@link SemanticRole} to a hue so that scanning a workspace tells you *what kind of
 * knowledge* you're looking at — evidence versus open question versus deliverable —
 * before you read a single title.
 *
 * Kept separate from the card-*type* palette in `cardTypeDefinition.ts`, which answers a
 * different question (how is this card rendered and studied). A card can be a `question`
 * type serving a `task` role; conflating the two would make one of them lie.
 */
const ROLE_COLORS: Record<SemanticRole, string> = {
  goal: "#C5A8FF",
  question: "#FFB45B",
  concept: "#75C8FF",
  source: "#63E6D5",
  experiment: "#8FD16A",
  claim: "#E8829B",
  task: "#FFD466",
  deliverable: "#FF7895",
};

/** The colour for a semantic role, or null when a card has none — never invent one. */
export function roleColor(role: SemanticRole | undefined): string | null {
  return role ? ROLE_COLORS[role] : null;
}

export interface LearningTheme {
  mode: AppState["theme"];
  background: string;
  panel: string;
  panelStrong: string;
  panelMuted: string;
  text: string;
  textMuted: string;
  textFaint: string;
  line: string;
  accent: string;
  accentSoft: string;
  accentInk: string;
  danger: string;
  warning: string;
  /** Web-derived evidence — kept distinct from the accent. See `Palette.evidence`. */
  evidence: string;
  /** The face for commands, metadata, IDs, and system labels — the console's own voice. */
  fontMono: string;
  /** The face for reading-length prose. Falls back to the platform UI font. */
  fontSans: string | undefined;
}

export const ACCENT_OPTIONS: { name: AccentName; color: string; label: string }[] = [
  { name: "teal", color: "#63E6D5", label: "Ion" },
  { name: "lilac", color: "#C5A8FF", label: "Violet" },
  { name: "amber", color: "#FFB45B", label: "Solar" },
  { name: "rose", color: "#FF7895", label: "Coral" },
  { name: "arctic", color: "#75C8FF", label: "Arctic" },
];

const SYSTEM_MONO_FAMILY = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
}) as string;

/**
 * Resolves a {@link FontChoice} to a value `fontFamily` accepts. System choices become the
 * platform face (or `undefined` for sans, which is how RN asks for the default UI font);
 * installed fonts are referenced by the family name they were registered under.
 */
function resolveFontFamily(choice: FontChoice, role: "mono" | "sans"): string | undefined {
  if (choice.source === "system") {
    return role === "mono" ? SYSTEM_MONO_FAMILY : undefined;
  }
  return choice.family;
}

/**
 * Builds the theme from the user's appearance settings.
 *
 * The legacy `mode`/`accentName` arguments still work and still win when no palette has
 * been chosen, so existing callers and saved settings behave exactly as before — the
 * palette system is additive, not a migration.
 */
export function resolveLearningTheme(
  mode: AppState["theme"],
  accentName: AccentName,
  appearance?: AppearanceSettings
): LearningTheme {
  const legacyAccent =
    ACCENT_OPTIONS.find(option => option.name === accentName)?.color ?? ACCENT_OPTIONS[0].color;

  const resolved = resolveAppearance(appearance);
  const usingCustomPalette = Boolean(appearance?.paletteId);
  const palette = resolved.palette;

  // Without an explicit palette the app keeps its original light/dark pair, so nobody's
  // existing look changes underneath them just because this feature shipped.
  const dark = usingCustomPalette ? palette.mode === "dark" : mode === "dark";
  const accent = appearance?.accentOverride
    ? resolved.accent
    : usingCustomPalette
      ? palette.accent
      : legacyAccent;

  const base = usingCustomPalette
    ? palette
    : {
        background: dark ? "#090E13" : "#EEF1EC",
        panel: dark ? "#101820" : "#FBFCF7",
        panelStrong: dark ? "#17232C" : "#FFFFFF",
        panelMuted: dark ? "#0D141A" : "#E4E9E2",
        text: dark ? "#F2F6F1" : "#131A1A",
        textMuted: dark ? "#A7B6B5" : "#536260",
        textFaint: dark ? "#637574" : "#7B8884",
        line: dark ? "#26363D" : "#CBD4CE",
        accentInk: dark ? "#06110F" : "#07110F",
        danger: "#FF5F69",
        warning: "#FFB45B",
        evidence: dark ? "#8AB4FF" : "#1F5FBF",
      };

  return {
    mode: dark ? "dark" : "light",
    background: base.background,
    panel: base.panel,
    panelStrong: base.panelStrong,
    panelMuted: base.panelMuted,
    text: base.text,
    textMuted: base.textMuted,
    textFaint: base.textFaint,
    line: base.line,
    accent,
    accentSoft: `${accent}22`,
    accentInk: base.accentInk,
    danger: base.danger,
    warning: base.warning,
    evidence: base.evidence,
    fontMono: resolveFontFamily(resolved.monoFont, "mono") ?? SYSTEM_MONO_FAMILY,
    fontSans: resolveFontFamily(resolved.sansFont, "sans"),
  };
}
