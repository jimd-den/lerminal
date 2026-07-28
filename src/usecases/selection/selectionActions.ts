import { Card } from "../../entities/card";
import { isSchedulable, CardTypeDefinition } from "../../entities/cardTypeDefinition";
import { SuggestedActionDispatch } from "../actions/SuggestedAction";

/**
 * # Selection Tray Actions
 *
 * ## Business Value & Purpose
 * When cards are selected, the bottom tray is the touch-first equivalent of typing a
 * pipeline. Previously it offered two vague buttons — "Organize" and "Transform" — that
 * both did the same thing (open the command palette), so the tray communicated nothing
 * about what was actually possible. This module names the five real moves (Explain,
 * Research, Connect, Study, More) and decides, per selection, which ones make sense.
 *
 * ## Two rules it encodes
 * 1. **No hidden AI.** Every AI-backed action dispatches to the preflight sheet, never
 *    straight to a gateway — the same guarantee {@link nextActionsForCard} makes.
 * 2. **Disabled beats absent.** An action that doesn't apply to the current selection is
 *    returned with `enabled: false` and a plain-language `disabledReason`, rather than
 *    silently disappearing. A tray whose buttons move around as you select is a tray you
 *    can't build muscle memory for, and a greyed button with a reason teaches the model
 *    of the app ("Study needs question or cloze cards") where a missing one just confuses.
 */

export type SelectionActionDispatch = SuggestedActionDispatch;

export interface SelectionAction {
  id: string;
  label: string;
  dispatch: SelectionActionDispatch;
  enabled: boolean;
  /** Why it's unavailable — shown to the user; null whenever `enabled`. */
  disabledReason: string | null;
}

/**
 * Small helper so each action below reads as a single line of intent. Availability is
 * expressed as an optional reason: a truthy reason *is* the disablement, which keeps the
 * two fields from ever contradicting each other.
 */
function action(
  id: string,
  label: string,
  dispatch: SelectionActionDispatch,
  disabledReason?: string | null
): SelectionAction {
  return {
    id,
    label,
    dispatch,
    enabled: !disabledReason,
    disabledReason: disabledReason ?? null,
  };
}

/** Cards whose content the agent can meaningfully read and explain. */
function hasExplainableContent(cards: Card[]): boolean {
  return cards.some(card => card.type !== "group" && (card.body?.trim() || card.answer?.trim()));
}

/** True when at least one selected card is already practice material. */
function hasStudyableContent(cards: Card[], registry?: CardTypeDefinition[]): boolean {
  return cards.some(card => isSchedulable(card, registry));
}

export interface SelectionActionsInput {
  selectedCards: Card[];
  /** The card-type registry, so study eligibility respects user-defined types. */
  cardTypes?: CardTypeDefinition[];
}

/**
 * The five tray actions for the current selection, in fixed order.
 *
 * The order never changes — position is how a thumb finds a button without reading it.
 */
export function selectionActions(input: SelectionActionsInput): SelectionAction[] {
  const { selectedCards, cardTypes } = input;
  const empty = selectedCards.length === 0;

  return [
    action(
      "explain",
      "Explain",
      { kind: "preflight", presetId: "explain-selected" },
      empty
        ? "Select cards first"
        : hasExplainableContent(selectedCards)
          ? null
          : "Selected cards have no text to explain"
    ),
    // Research is the one action that stands on its own: it reads the web, not the
    // selection, so an empty selection is a perfectly valid starting point for it.
    action("research", "Research", { kind: "preflight", presetId: "research-web" }),
    action(
      "connect",
      "Connect",
      { kind: "pipeline", text: "group" },
      empty
        ? "Select cards first"
        : selectedCards.length < 2
          ? "Select two or more cards to connect them"
          : null
    ),
    action(
      "study",
      "Study",
      { kind: "preflight", presetId: "make-study-cards" },
      empty ? "Select cards first" : null
    ),
    action("more", "More", { kind: "palette" }),
  ];
}

/**
 * Whether the selection can be enrolled into spaced repetition right now — used by the
 * tray to offer `space` as a direct follow-up once study cards exist, rather than making
 * the user discover the command. Deliberately separate from {@link selectionActions}:
 * scheduling is a commitment, so it appears only when it would actually do something.
 */
export function canEnrollInStudy(input: SelectionActionsInput): boolean {
  return hasStudyableContent(input.selectedCards, input.cardTypes);
}
