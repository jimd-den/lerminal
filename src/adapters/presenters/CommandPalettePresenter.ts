import { AppState } from "./GriotController";
import { CommandDefinition } from "../../entities/commandDefinition";
import {
  CanonicalAction,
  CommandAvailability,
  CommandDoc,
  CANONICAL_ACTIONS,
  COMMAND_DOCS,
  commandAvailability,
} from "../../usecases/commands/commandCatalog";
import { expandForPipe } from "../../entities/tree";

/**
 * # Command Palette Presenter
 *
 * ## Business Value & Purpose
 * Assembles everything the palette shows, with the current selection already folded in,
 * so the component renders a list instead of computing eligibility inline. The palette's
 * central promise — *you can see what a command needs before you run it* — is enforced
 * here by pairing every documented command with its {@link CommandAvailability}.
 */

/** A documented built-in, plus whether it can run against the current selection. */
export interface PaletteCommand {
  doc: CommandDoc;
  availability: CommandAvailability;
}

/** A canonical action, plus whether the current selection satisfies it. */
export interface PaletteAction {
  action: CanonicalAction;
  availability: CommandAvailability;
}

export interface CommandPaletteModel {
  /**
   * Plain-language description of what a command would receive, e.g.
   * "3 cards selected" — the palette's answer to "what am I about to act on?".
   */
  selectionSummary: string;
  selectedCount: number;
  /** The ten canonical actions, in catalog order. */
  actions: PaletteAction[];
  /** Documented built-ins, grouped for scanning. */
  commands: PaletteCommand[];
  /** The user's own commands and macros, untouched by this phase. */
  customCommands: CommandDefinition[];
  /** Pinned keywords, preserved exactly as before. */
  pinnedCommands: string[];
}

/**
 * Describes the selection the way a user thinks about it. Uses the expanded count (see
 * {@link expandForPipe}) so a selected group is reported as the whole subtree a command
 * would actually receive, matching the selection tray.
 */
function summarizeSelection(count: number): string {
  if (count === 0) return "Nothing selected — commands that need input will say so";
  return `${count} card${count === 1 ? "" : "s"} selected`;
}

/** Availability for a canonical action, expressed in the same shape as a command's. */
function actionAvailability(action: CanonicalAction, selectedCount: number): CommandAvailability {
  if (action.requiresSelection && selectedCount === 0) {
    return { runnable: false, reason: "Select cards first" };
  }
  return { runnable: true, reason: null };
}

export function presentCommandPalette(state: AppState): CommandPaletteModel {
  const selectedCount = expandForPipe(state.cards, state.selection).length;

  return {
    selectionSummary: summarizeSelection(selectedCount),
    selectedCount,
    actions: CANONICAL_ACTIONS.map(action => ({
      action,
      availability: actionAvailability(action, selectedCount),
    })),
    commands: COMMAND_DOCS.map(doc => ({
      doc,
      availability: commandAvailability(doc, selectedCount),
    })),
    customCommands: state.commandDefinitions,
    pinnedCommands: state.pinnedCommands,
  };
}
