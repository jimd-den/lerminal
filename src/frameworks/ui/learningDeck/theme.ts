import { Platform } from "react-native";
import { AppState } from "../../../adapters/presenters/LearnimalController";
import { SemanticRole } from "../../../entities/card";

export type AccentName = AppState["accent"];

/**
 * # Type Scale
 *
 * ## Business Value & Purpose
 * The HUD styling had drifted into 7, 8, and 9-point labels — legible in a mockup on a
 * desktop monitor, not on a phone at arm's length, and well under what anyone with even
 * mild visual impairment can read. This scale sets a hard floor of 11pt and gives every
 * size a name describing its *job*, so the next label added has an obvious size to pick
 * rather than a number someone eyeballed.
 *
 * Six steps is deliberate. A scale with a step for every occasion stops being a scale.
 */
export const TypeScale = {
  /** System labels, HUD eyebrows, badges. The floor — never go below this. */
  label: 11,
  /** Metadata, IDs, intervals, provenance lines. */
  meta: 12,
  /** Default body text. */
  body: 14,
  /** Emphasised body — card titles in lists, primary buttons. */
  bodyStrong: 15,
  /** Section and card titles. */
  title: 18,
  /** Screen headings. */
  display: 22,
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
  fontMono: string;
}

export const ACCENT_OPTIONS: { name: AccentName; color: string; label: string }[] = [
  { name: "teal", color: "#63E6D5", label: "Ion" },
  { name: "lilac", color: "#C5A8FF", label: "Violet" },
  { name: "amber", color: "#FFB45B", label: "Solar" },
  { name: "rose", color: "#FF7895", label: "Coral" },
  { name: "arctic", color: "#75C8FF", label: "Arctic" },
];

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) as string;

export function resolveLearningTheme(mode: AppState["theme"], accentName: AccentName): LearningTheme {
  const accent = ACCENT_OPTIONS.find(option => option.name === accentName)?.color ?? ACCENT_OPTIONS[0].color;
  const dark = mode === "dark";
  return {
    mode,
    background: dark ? "#090E13" : "#EEF1EC",
    panel: dark ? "#101820" : "#FBFCF7",
    panelStrong: dark ? "#17232C" : "#FFFFFF",
    panelMuted: dark ? "#0D141A" : "#E4E9E2",
    text: dark ? "#F2F6F1" : "#131A1A",
    textMuted: dark ? "#A7B6B5" : "#536260",
    textFaint: dark ? "#637574" : "#7B8884",
    line: dark ? "#26363D" : "#CBD4CE",
    accent,
    accentSoft: `${accent}22`,
    accentInk: dark ? "#06110F" : "#07110F",
    danger: "#FF5F69",
    warning: "#FFB45B",
    fontMono: MONO,
  };
}
