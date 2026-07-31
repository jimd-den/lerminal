import { AppState } from "./GriotController";
import { Card } from "../../entities/card";
import { NextAction, nextActionsForCard } from "../../usecases/capture/nextActions";
import {
  SelectionAction,
  canEnrollInStudy,
  selectionActions,
} from "../../usecases/selection/selectionActions";
import { expandForPipe } from "../../entities/tree";

/**
 * # Capture Receipt & Selection Tray Presenter
 *
 * ## Business Value & Purpose
 * Two view-models, both derived purely from {@link AppState}, both answering "what just
 * happened / what can I do now" without the UI needing to know a single domain rule.
 *
 * Keeping these as free functions rather than controller state matters for a specific
 * reason: a receipt's suggestions depend on cards that may change *after* the receipt is
 * created (an undo, an edit, a workspace switch). Deriving on read means the panel can
 * never show a follow-up for a card that no longer exists, and nothing has to be
 * invalidated by hand.
 */

export interface CaptureReceiptModel {
  /** One-line statement of what was created, e.g. "3 study chunks created". */
  summary: string;
  /** Plain-language "where it landed" — a group title, or the workspace name at root. */
  destinationLabel: string;
  /** The cards created, in creation order. */
  createdCards: Card[];
  /** Copy for the button that opens the output. */
  primaryActionLabel: string;
  /** The 2-3 context-sensitive follow-ups (see `nextActionsForCard`). */
  nextActions: NextAction[];
  /**
   * True when the run replaced the user's selection with its own output. The panel says
   * so out loud: auto-reselection is what makes `ask | chunk | recall` feel like one
   * gesture, but silently swapping what's selected is the kind of invisible state change
   * that makes an app feel like it's acting behind your back.
   */
  selectionChanged: boolean;
  /** True when this run can still be reversed — see `UndoOperationInteractor`. */
  canUndo: boolean;
  /**
   * Set when the created cards came from a local template because no model answered.
   * Read from the cards' own provenance rather than tracked separately, so the warning
   * and the card's permanent record can never disagree.
   */
  localFallbackReason: string | null;
}

/**
 * Resolves where a run's output landed, preferring the containing group's own title and
 * falling back to the workspace name — never a raw id, which would be true but useless.
 */
function resolveDestinationLabel(state: AppState, groupId: string | undefined): string {
  if (groupId) {
    const group = state.cards.find(card => card.id === groupId);
    if (group) return group.title;
  }
  const workspace = state.workspaces.find(w => w.id === state.activeWorkspaceId);
  return workspace ? workspace.name : "this workspace";
}

/**
 * Builds the post-capture receipt, or null when there's nothing to report.
 *
 * Suggestions are keyed off the *first* created card: a run emits one kind of thing, so
 * its first output is representative, and offering one clear set of follow-ups beats
 * merging the menus of every card into an unreadable union.
 */
export function presentCaptureReceipt(state: AppState): CaptureReceiptModel | null {
  const result = state.operationResult;
  if (!result) return null;

  const createdCards = result.createdCardIds
    .map(id => state.cards.find(card => card.id === id))
    .filter((card): card is Card => Boolean(card));

  const hasMission = Boolean(state.gapReport?.hasMission);
  const nextActions = createdCards.length > 0
    ? nextActionsForCard(createdCards[0], { hasMission })
    : [];

  return {
    summary: result.summary,
    destinationLabel: resolveDestinationLabel(state, result.destination.groupId),
    createdCards,
    primaryActionLabel: result.primaryActionLabel,
    nextActions,
    selectionChanged: createdCards.some(card => state.selection.has(card.id)),
    canUndo: Boolean(state.undoableOperationId),
    localFallbackReason: createdCards.some(card => card.provenance?.isLocalFallback)
      ? "No model answered, so these were written from a local template — not an AI response."
      : null,
  };
}

/** Re-exported so UI components type their props without reaching into `usecases/`. */
export type { SelectionAction };

export interface SelectionTrayModel {
  /** How many cards are selected — always shown, so the tray's scope is never a guess. */
  count: number;
  /** The five fixed actions, some possibly disabled with a reason. */
  actions: SelectionAction[];
  /** True when `space` would actually schedule something in the current selection. */
  canEnrollInStudy: boolean;
}

/**
 * Builds the selection tray model. Uses {@link expandForPipe} so the count reflects what
 * a command would *actually* receive — selecting a group feeds its whole subtree, and a
 * tray reading "1 selected" before an action touches thirty cards would be a lie.
 */
export function presentSelectionTray(state: AppState): SelectionTrayModel {
  const selectedCards = expandForPipe(state.cards, state.selection);
  return {
    count: selectedCards.length,
    actions: selectionActions({ selectedCards, cardTypes: state.cardTypes }),
    canEnrollInStudy: canEnrollInStudy({ selectedCards, cardTypes: state.cardTypes }),
  };
}
