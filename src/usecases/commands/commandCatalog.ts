import { SuggestedActionDispatch } from "../actions/SuggestedAction";

/**
 * # Command Catalog — the Unix model, documented
 *
 * ## Business Value & Purpose
 * The palette used to show a bare keyword and a six-word blurb ("chunk — Restructure
 * source into study chunks"), which told a newcomer nothing about what it *needs*, what
 * it *produces*, or whether it would touch the network. This module documents every
 * built-in command along the four axes a user actually needs before running something
 * they haven't run before: what it takes in, what it emits, whether it uses the web, and
 * what it's for in plain language.
 *
 * ## Why the docs live here and not in the palette component
 * The catalog previously lived as a literal array inside `CommandConsoleModal.tsx` — UI
 * code owning domain knowledge. Moving it to the use-case layer means the same
 * descriptions can drive the palette, an onboarding screen, or a `help` command without
 * being copied, and the "does this need a selection?" rule becomes testable.
 *
 * ## What it deliberately does not do
 * It does not execute anything, and it does not duplicate the command implementations in
 * `usecases/pipeline/`. It is documentation-as-data about them.
 */

/**
 * What a command consumes. This is the distinction the spec calls out — commands that
 * transform *what you've selected* versus commands that *start something fresh* — and
 * getting it wrong is the difference between "nothing happened" and understanding why.
 */
export type CommandInput =
  /** Operates on the current selection; useless without one. */
  | { kind: "selection"; description: string }
  /** Needs a typed argument (a query, a URL, a name). */
  | { kind: "argument"; description: string }
  /** Starts fresh — no selection, no argument required. */
  | { kind: "none"; description: string };

export type CommandCategory = "capture" | "transform" | "practice" | "organize" | "session";

export interface CommandDoc {
  /** The terminal keyword, exactly as typed in a pipeline. */
  name: string;
  /** Plain-language label — what you'd call it out loud. */
  label: string;
  /** One line on what it's for. */
  purpose: string;
  input: CommandInput;
  /** What lands on the canvas afterwards. */
  output: string;
  /** True only for commands that actually reach the network. */
  usesWeb: boolean;
  /**
   * True when the command calls a language model. Separate from {@link usesWeb} because
   * they are genuinely different exposures: `ask` calls a model but never browses, and
   * `search` browses but never calls a model. Collapsing them into one flag is precisely
   * the confusion this app exists to remove.
   */
  usesModel: boolean;
  category: CommandCategory;
}

// Input shapes are shared rather than re-typed per command, so "requires a selection"
// reads identically everywhere it appears in the palette.
const needsSelection = (description: string): CommandInput => ({ kind: "selection", description });
const needsArgument = (description: string): CommandInput => ({ kind: "argument", description });
const startsFresh = (description: string): CommandInput => ({ kind: "none", description });

/**
 * Every built-in command, documented. Ordered by category then rough frequency of use,
 * because the palette renders them in this order and a list you scan often should put
 * the things you reach for often near the top.
 */
export const COMMAND_DOCS: CommandDoc[] = [
  {
    name: "note",
    label: "Write a note",
    purpose: "Capture a thought as a note card, with no AI involved.",
    input: needsArgument("The note's text"),
    output: "One note card",
    usesWeb: false,
    usesModel: false,
    category: "capture",
  },
  {
    name: "source",
    label: "Add a source",
    purpose: "Bring in material from a URL or pasted text.",
    input: needsArgument("A URL, or the text itself"),
    output: "One source card (a URL is fetched and converted to readable text)",
    usesWeb: true,
    usesModel: false,
    category: "capture",
  },
  {
    name: "search",
    label: "Search the web",
    purpose: "Run a web search and keep the results as an inspectable card.",
    input: needsArgument("The search query"),
    output: "One search card listing the results — nothing here is model-written",
    usesWeb: true,
    usesModel: false,
    category: "capture",
  },
  {
    name: "ask",
    label: "Ask the AI",
    purpose: "Ask a model to write cards, reading your selection as context.",
    input: startsFresh("Optional: selected cards become the reading context"),
    output: "Study cards written by the model",
    usesWeb: false,
    usesModel: true,
    category: "capture",
  },
  {
    name: "chat",
    label: "Start a conversation",
    purpose: "Open a chat card grounded in the cards around it.",
    input: needsArgument("A name for the conversation"),
    output: "One chat card you can talk to",
    usesWeb: false,
    usesModel: true,
    category: "capture",
  },
  {
    name: "chunk",
    label: "Break into study chunks",
    purpose: "Restructure long material into small, self-contained ideas.",
    input: needsSelection("Source, note, or chunk cards"),
    output: "Chunk cards inside a document group. Falls back to a structural split without an API key",
    usesWeb: false,
    usesModel: true,
    category: "transform",
  },
  {
    name: "split",
    label: "Split by structure",
    purpose: "Divide a document along its own headings — no AI, always faithful.",
    input: needsSelection("Source, note, or chunk cards"),
    output: "Chunk cards mirroring the document's heading structure",
    usesWeb: false,
    usesModel: false,
    category: "transform",
  },
  {
    name: "elaborate",
    label: "Explain in your own words",
    purpose: "Turn material into Feynman-style prompts you answer yourself.",
    input: needsSelection("Chunk, source, or note cards"),
    output: "Elaboration cards holding the original as the model answer",
    usesWeb: false,
    usesModel: false,
    category: "transform",
  },
  {
    name: "recall",
    label: "Make recall questions",
    purpose: "Turn material into question cards with the answer hidden.",
    input: needsSelection("Chunk, source, or note cards"),
    output: "Question cards — not yet scheduled",
    usesWeb: false,
    usesModel: false,
    category: "practice",
  },
  {
    name: "cloze",
    label: "Make fill-in-the-blanks",
    purpose: "Blank out the key terms in a passage for retrieval practice.",
    input: needsSelection("Chunk, source, or note cards"),
    output: "Cloze cards — not yet scheduled",
    usesWeb: false,
    usesModel: false,
    category: "practice",
  },
  {
    name: "space",
    label: "Schedule for review",
    purpose: "Enrol practice cards into spaced repetition.",
    input: needsSelection("Question, cloze, or elaboration cards"),
    output: "The same cards, now scheduled. Notes and sources are skipped",
    usesWeb: false,
    usesModel: false,
    category: "practice",
  },
  {
    name: "review",
    label: "Review what's due",
    purpose: "Run today's due queue.",
    input: startsFresh("Uses everything due in this workspace"),
    output: "Opens the review session; grading updates each card's schedule",
    usesWeb: false,
    usesModel: false,
    category: "session",
  },
  {
    name: "group",
    label: "Group together",
    purpose: "Bundle the selected cards under a new group.",
    input: needsSelection("Two or more cards"),
    output: "One group card containing them",
    usesWeb: false,
    usesModel: false,
    category: "organize",
  },
  {
    name: "ungroup",
    label: "Dissolve a group",
    purpose: "Free a group's children and remove the container.",
    input: needsSelection("Group cards"),
    output: "The freed children, moved up one level",
    usesWeb: false,
    usesModel: false,
    category: "organize",
  },
  {
    name: "move",
    label: "Move to another space",
    purpose: "Send the selected cards to a different workspace.",
    input: needsSelection("Any cards, plus a destination name"),
    output: "Nothing here — the cards leave this workspace",
    usesWeb: false,
    usesModel: false,
    category: "organize",
  },
  {
    name: "delete",
    label: "Delete",
    purpose: "Permanently remove the selected cards.",
    input: needsSelection("Any cards; a selected group takes its contents with it"),
    output: "Nothing — this cannot be undone from the palette",
    usesWeb: false,
    usesModel: false,
    category: "organize",
  },
];

export function findCommandDoc(name: string): CommandDoc | undefined {
  return COMMAND_DOCS.find(doc => doc.name === name.toLowerCase());
}

/** Whether a command can run right now, and if not, the reason in the user's terms. */
export interface CommandAvailability {
  runnable: boolean;
  reason: string | null;
}

/**
 * Availability given the current selection.
 *
 * Argument-taking commands are always "runnable": typing `search` with no query opens the
 * input sheet rather than failing, which is a legitimate way to start. Only a
 * selection-hungry command with an empty selection is genuinely blocked.
 */
export function commandAvailability(doc: CommandDoc, selectedCount: number): CommandAvailability {
  if (doc.input.kind === "selection" && selectedCount === 0) {
    return { runnable: false, reason: `Needs a selection: ${doc.input.description.toLowerCase()}` };
  }
  return { runnable: true, reason: null };
}

/**
 * # Canonical Actions
 *
 * The ten things the product is *for*, named as a user would name them. Several are the
 * explicit AI operations from `operationPresets.ts`; the rest are deterministic. Listing
 * them together at the top of the palette means a user who has never typed a pipeline can
 * still find every important capability, while the documented commands below remain the
 * composable primitives those actions are built from.
 */
export interface CanonicalAction {
  id: string;
  label: string;
  purpose: string;
  /** The `/alias` a power user can type instead. */
  alias: string;
  dispatch: SuggestedActionDispatch;
  usesWeb: boolean;
  /**
   * True when carrying this action out calls a language model. Note the non-obvious
   * cases: "Make study cards" runs the deterministic `recall` command and calls nothing,
   * and "Status" is computed entirely from the card graph — so neither is badged, which
   * is exactly the sort of thing a user would otherwise have to guess at.
   */
  usesModel: boolean;
  requiresSelection: boolean;
}

export const CANONICAL_ACTIONS: CanonicalAction[] = [
  {
    id: "capture",
    label: "Capture",
    purpose: "Write a note, paste text, or add a link.",
    alias: "/capture",
    dispatch: { kind: "capture", intent: "note" },
    usesWeb: false,
    usesModel: false,
    requiresSelection: false,
  },
  {
    id: "explain",
    label: "Explain",
    purpose: "Explain the selected cards using only what's selected.",
    alias: "/explain",
    dispatch: { kind: "preflight", presetId: "explain-selected" },
    usesWeb: false,
    usesModel: true,
    requiresSelection: true,
  },
  {
    id: "research",
    label: "Research web",
    purpose: "Search the web and inspect the sources before keeping any.",
    alias: "/research",
    dispatch: { kind: "preflight", presetId: "research-web" },
    usesWeb: true,
    usesModel: false,
    requiresSelection: false,
  },
  {
    id: "prereqs",
    label: "Find prerequisites",
    purpose: "Work out what you need to know first.",
    alias: "/prereqs",
    dispatch: { kind: "preflight", presetId: "find-prerequisites" },
    usesWeb: false,
    usesModel: true,
    requiresSelection: false,
  },
  {
    id: "connect",
    label: "Connect",
    purpose: "Group the selected cards together.",
    alias: "/connect",
    dispatch: { kind: "pipeline", text: "group" },
    usesWeb: false,
    usesModel: false,
    requiresSelection: true,
  },
  {
    id: "experiment",
    label: "Plan experiment",
    purpose: "Turn selected material into something you can actually try.",
    alias: "/experiment",
    dispatch: { kind: "preflight", presetId: "plan-experiment" },
    usesWeb: false,
    usesModel: true,
    requiresSelection: true,
  },
  {
    id: "study",
    label: "Make study cards",
    purpose: "Turn selected material into recall questions.",
    alias: "/study",
    dispatch: { kind: "preflight", presetId: "make-study-cards" },
    usesWeb: false,
    usesModel: false,
    requiresSelection: true,
  },
  {
    id: "review",
    label: "Review",
    purpose: "Run today's due reviews.",
    alias: "/review",
    dispatch: { kind: "pipeline", text: "review" },
    usesWeb: false,
    usesModel: false,
    requiresSelection: false,
  },
  {
    id: "status",
    label: "Status",
    purpose: "See what you have, what's missing, and what to do next.",
    alias: "/status",
    dispatch: { kind: "status" },
    usesWeb: false,
    usesModel: false,
    requiresSelection: false,
  },
  {
    id: "build",
    label: "Plan capstone",
    purpose: "Turn the mission into milestones and next tasks.",
    alias: "/build",
    dispatch: { kind: "preflight", presetId: "plan-capstone" },
    usesWeb: false,
    usesModel: true,
    requiresSelection: false,
  },
];

/**
 * Resolves a typed `/alias` to its action.
 *
 * Deliberately only matches a *bare* alias: `/research` resolves, but `/research foo` is
 * left alone so it falls through to the pipeline parser as a normal command with an
 * argument. An alias is a shortcut to a sheet, not a new syntax to learn.
 */
export function resolveCommandAlias(input: string): CanonicalAction | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed.startsWith("/")) return null;
  return CANONICAL_ACTIONS.find(action => action.alias === trimmed) ?? null;
}
