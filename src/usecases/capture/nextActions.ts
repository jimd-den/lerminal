import { Card, SemanticRole } from "../../entities/card";

/**
 * # Next Actions — "capture must lead somewhere"
 *
 * ## Business Value & Purpose
 * Creating a card is never the end of a thought. Before this module, adding a note
 * dropped the user back on the deck with a toast and no suggestion of what to do with
 * what they'd just written — the capture dead-ended. This module answers one question,
 * purely and deterministically: *given the card that was just created, what are the two
 * or three most useful things to do next?*
 *
 * ## Why it lives in the use-case layer
 * "What can I do next" is application policy, not rendering. Keeping it here means the
 * rule is unit-testable without a React tree, and the UI stays a dumb mapping from
 * {@link NextAction} to a button. It is a pure function of the card — no repositories,
 * no gateways, no clock.
 *
 * ## Composition
 * Each suggestion is a tiny named builder ({@link explainAction}, {@link researchAction},
 * …) so the per-role menus below read as a list of intentions rather than a wall of
 * object literals, and a suggestion's copy is defined in exactly one place even when
 * four different roles offer it.
 */

/**
 * How the UI should carry out a suggestion.
 *
 * `preflight` is deliberately the only route to anything AI-backed: a next action can
 * *propose* an AI operation, but it always lands the user on the scope sheet first. A
 * one-tap suggestion must never become hidden AI execution.
 */
export type NextActionDispatch =
  | { kind: "preflight"; presetId: string }
  | { kind: "pipeline"; text: string }
  | { kind: "mission" };

export interface NextAction {
  /** Stable identifier — used for React keys and assertions, never shown. */
  id: string;
  /** Button copy. A verb phrase, because every one of these is something you *do*. */
  label: string;
  dispatch: NextActionDispatch;
}

// --- The vocabulary of suggestions -----------------------------------------
// One builder per distinct thing a learner might do next. Shared across roles so
// "Find prerequisites" is worded identically wherever it appears.

const explainAction = (): NextAction => ({
  id: "explain",
  label: "Explain this",
  dispatch: { kind: "preflight", presetId: "explain-selected" },
});

const prerequisitesAction = (): NextAction => ({
  id: "prerequisites",
  label: "Find prerequisites",
  dispatch: { kind: "preflight", presetId: "find-prerequisites" },
});

const researchAction = (): NextAction => ({
  id: "research",
  label: "Research on the web",
  dispatch: { kind: "preflight", presetId: "research-web" },
});

const studyCardsAction = (): NextAction => ({
  id: "study-cards",
  label: "Turn into study cards",
  dispatch: { kind: "preflight", presetId: "make-study-cards" },
});

const planExperimentAction = (): NextAction => ({
  id: "plan-experiment",
  label: "Plan an experiment",
  dispatch: { kind: "preflight", presetId: "plan-experiment" },
});

const attachToMissionAction = (): NextAction => ({
  id: "attach-mission",
  label: "Attach to mission",
  dispatch: { kind: "mission" },
});

/** Deterministic — `chunk` splits the source structurally when no key is configured. */
const extractKeyIdeasAction = (): NextAction => ({
  id: "extract-ideas",
  label: "Extract key ideas",
  dispatch: { kind: "pipeline", text: "chunk" },
});

const createTaskAction = (): NextAction => ({
  id: "create-task",
  label: "Create next task",
  dispatch: { kind: "preflight", presetId: "plan-capstone" },
});

/**
 * The menus themselves, one per semantic role. Each is capped at three: a capture
 * confirmation that offers five choices is a menu, not a nudge, and re-opens the
 * decision the user just closed by writing something down.
 */
const MENUS: Record<SemanticRole, () => NextAction[]> = {
  question: () => [researchAction(), prerequisitesAction(), explainAction()],
  concept: () => [explainAction(), studyCardsAction(), prerequisitesAction()],
  source: () => [extractKeyIdeasAction(), studyCardsAction(), researchAction()],
  experiment: () => [planExperimentAction(), prerequisitesAction(), createTaskAction()],
  claim: () => [researchAction(), explainAction(), studyCardsAction()],
  task: () => [createTaskAction(), prerequisitesAction(), attachToMissionAction()],
  deliverable: () => [createTaskAction(), attachToMissionAction(), explainAction()],
  goal: () => [prerequisitesAction(), researchAction(), attachToMissionAction()],
};

/** The menu for a plain note, and the fallback when a card's role/type says nothing useful. */
const noteMenu = (): NextAction[] => [
  explainAction(),
  prerequisitesAction(),
  attachToMissionAction(),
];

/**
 * Resolves the semantic role to key the menu off. Prefers an explicit
 * {@link SemanticRole}, then falls back to the legacy `CardType` so cards created before
 * roles existed still get sensible suggestions — the same precedence the gap report uses.
 */
function resolveRole(card: Card): SemanticRole | null {
  if (card.role) return card.role;
  switch (card.type) {
    case "source":
      return "source";
    case "chunk":
      return "concept";
    case "question":
      return "question";
    default:
      return null;
  }
}

export interface NextActionOptions {
  /**
   * Whether the workspace has a mission. Without one, "Attach to mission" would send the
   * user to an empty editor as a *follow-up to unrelated work* — so it is dropped rather
   * than dangled. Defining a mission is offered in its own right by Mission Control.
   */
  hasMission?: boolean;
}

/**
 * The public entry point: the 2–3 most useful follow-ups for a freshly created card.
 *
 * Ordering is significant — the first entry is rendered as the primary action, so each
 * menu leads with the move that most often *continues* the work rather than inspecting it.
 */
export function nextActionsForCard(card: Card, options: NextActionOptions = {}): NextAction[] {
  const role = resolveRole(card);
  const actions = role ? MENUS[role]() : noteMenu();
  return options.hasMission === false
    ? actions.filter(action => action.dispatch.kind !== "mission")
    : actions;
}
