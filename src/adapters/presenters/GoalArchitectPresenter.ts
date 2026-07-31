import {
  GoalArchitectState,
  GoalArchitectStage,
} from "../../usecases/goal/GoalArchitectWorkflow";
import {
  Insight,
  InsightOrigin,
  MissionProposal,
  RecommendedResearch,
} from "../../entities/goalArchitect";

/**
 * # Goal Architect Presenter
 *
 * ## Business Value & Purpose
 * Turns the workflow's state into exactly what the sheet renders, so the UI holds no
 * derived logic of its own. The interesting work here is presenting *attribution*: the
 * whole feature rests on a user being able to see, at a glance, which lines are their own
 * words and which are a model's guesses.
 *
 * ## Why the labels live here and not in the component
 * "Agent hypothesis — verify or edit" is a product promise, not a styling choice. Deriving
 * it once, in a testable adapter, means no component can quietly render an agent's
 * suggestion without its label — the label arrives already attached to the row.
 */

/** A single map row, ready to render. */
export interface InsightRow {
  text: string;
  origin: InsightOrigin;
  /** The badge shown beside the text. Empty for the user's own words, which need none. */
  label: string;
  /** True when the user should check this before relying on it. */
  needsVerification: boolean;
}

export interface WorkingMapSection {
  heading: string;
  rows: InsightRow[];
}

export interface GoalArchitectViewModel {
  isOpen: boolean;
  stage: GoalArchitectStage;
  /** The prompt shown above the input, whether from the app's bank or the model. */
  prompt: string | null;
  /** Why this question is being asked. Never empty when there is a prompt. */
  rationale: string | null;
  /** Suggested answers, when the model offered any. */
  choices: string[];
  /** True when the current question came from the model rather than the app's bank. */
  isAgentQuestion: boolean;
  /**
   * True when the app opened this sheet itself on a first launch. The dismiss control
   * then reads "Start blank instead", because a sheet the user didn't ask for owes them
   * an obvious way out that says what dismissing it does.
   */
  isFirstRun: boolean;
  /** The dismiss control's label, which differs for an uninvited sheet. */
  dismissLabel: string;
  /** The model's prose for this turn. */
  agentMessage: string | null;
  agentError: string | null;
  isAgentThinking: boolean;
  /** How many questions have been answered or deliberately skipped. */
  answeredCount: number;
  canSkip: boolean;
  canPropose: boolean;
  /** Non-empty sections only, so the map never renders as a wall of empty headings. */
  mapSections: WorkingMapSection[];
  /** True once a model has contributed anything to the map. */
  hasAgentContributions: boolean;
  proposal: MissionProposal | null;
  recommendedResearch: RecommendedResearch[];
  /** The banner above the draft. Blunt on purpose. */
  proposalStatus: string;
  /** Plain statement of what a model and the web did, for the draft's footer. */
  provenanceSummary: string;
}

const ORIGIN_LABELS: Record<InsightOrigin, string> = {
  user: "",
  app: "FROM YOUR ANSWERS",
  agent: "AGENT HYPOTHESIS — VERIFY OR EDIT",
  web: "WEB EVIDENCE",
};

function toRow(item: Insight): InsightRow {
  return {
    text: item.text,
    origin: item.origin,
    label: ORIGIN_LABELS[item.origin],
    // Only a model's guess needs checking: the user's own words and the app's
    // deterministic derivations are not claims about the world.
    needsVerification: item.origin === "agent",
  };
}

function section(heading: string, items: Insight[]): WorkingMapSection | null {
  if (items.length === 0) return null;
  return { heading, rows: items.map(toRow) };
}

export function presentGoalArchitect(
  state: GoalArchitectState,
  canPropose: boolean
): GoalArchitectViewModel {
  const { map } = state;

  const sections = [
    map.goal ? { heading: "GOAL", rows: [toRow(map.goal)] } : null,
    map.deliverable ? { heading: "DELIVERABLE", rows: [toRow(map.deliverable)] } : null,
    section("CONSTRAINTS", map.constraints),
    section("ASSUMPTIONS", map.assumptions),
    section("PREREQUISITES", map.prerequisites),
    section("RISKS", map.risks),
    section("OPEN QUESTIONS", map.unknowns),
    section("CANDIDATE NEXT ACTIONS", map.candidateNextActions),
  ].filter((item): item is WorkingMapSection => item !== null);

  const agentQuestion = state.agentQuestion;
  const bankQuestion = state.question;

  const everyInsight = [
    map.goal,
    map.deliverable,
    ...map.constraints,
    ...map.assumptions,
    ...map.unknowns,
    ...map.prerequisites,
    ...map.risks,
    ...map.candidateNextActions,
  ].filter((item): item is Insight => item !== undefined);

  return {
    isOpen: state.isOpen,
    stage: state.stage,
    prompt: agentQuestion?.prompt ?? bankQuestion?.prompt ?? null,
    rationale: agentQuestion?.rationale ?? bankQuestion?.rationale ?? null,
    choices: agentQuestion?.choices ?? [],
    isAgentQuestion: agentQuestion !== null,
    isFirstRun: state.isFirstRun,
    dismissLabel: state.isFirstRun ? "START BLANK INSTEAD" : "CLOSE",
    agentMessage: state.agentMessage,
    agentError: state.agentError,
    isAgentThinking: state.isAgentThinking,
    answeredCount: state.answers.length,
    // The required opening question is the one thing that can't be skipped.
    canSkip: bankQuestion !== null && bankQuestion.optional,
    canPropose,
    mapSections: sections,
    hasAgentContributions: everyInsight.some(item => item.origin === "agent"),
    proposal: state.proposal,
    recommendedResearch: state.recommendedResearch,
    proposalStatus: "DRAFT MISSION — NOTHING HAS BEEN CREATED YET",
    provenanceSummary: describeProvenance(state),
  };
}

/**
 * States plainly what actually happened, in the user's terms.
 *
 * Phrased from what the session recorded rather than from what was offered, so a draft
 * built with a key configured but never invoked still says no model was used.
 */
function describeProvenance(state: GoalArchitectState): string {
  const parts: string[] = [];
  parts.push(
    state.modelUsed
      ? "A model contributed suggestions, marked as hypotheses above."
      : "No model was used — this plan came from your answers alone."
  );
  parts.push(
    state.webUsed
      ? "Web results you kept are cited on the cards they produced."
      : "The web was not searched."
  );
  return parts.join(" ");
}
