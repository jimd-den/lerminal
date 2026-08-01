import { CardType, SemanticRole } from "./card";

/**
 * # Mission — the shape of an accepted plan, and where each part of it came from
 *
 * ## Business Value & Purpose
 * A mission is the one place the app turns talk into structure: a goal, a deliverable,
 * the first proof, and the cards that carry them. This module is the pure core of that
 * structure — no questions, no conversation, no wizard.
 *
 * ## History
 * These types used to live in `entities/goalArchitect.ts`, beside a staged question-and-
 * form flow. That flow is gone: goal planning is now something the one Workspace Agent
 * ("Ask GRIOT") proposes as a tool intent in ordinary conversation. What survived the
 * deletion is exactly what the *mission* itself needs, rehomed here so nothing points at
 * a retired feature.
 *
 * ## The rule this module still enforces
 * Planning prose is the easiest thing in the app to fake convincingly, so nothing here
 * stores a bare string: every finding carries an {@link InsightOrigin} saying whether the
 * *user* said it, the *app* computed it, an *agent* guessed it, or the *web* returned it.
 * Blending those four is precisely how an app starts implying a model researched
 * something it never read, and a shared `string[]` is all it would take.
 */

/** Where a piece of a mission's reasoning came from. Never inferred, always recorded. */
export type InsightOrigin =
  /** The user said it. The only origin that counts as fact about their situation. */
  | "user"
  /** The app derived it deterministically from what the user said. */
  | "app"
  /** A model proposed it. Displayed as a hypothesis to verify or edit — never as fact. */
  | "agent"
  /** It came from a real search result that was actually retrieved. */
  | "web";

/** One finding, and where it came from. */
export interface Insight {
  text: string;
  origin: InsightOrigin;
}

export const insight = (text: string, origin: InsightOrigin): Insight => ({
  text: text.trim(),
  origin,
});

/**
 * The origin-tagged assessment a mission is built from.
 *
 * Every list is origin-tagged so the mission's own notes can separate what the user said
 * from what a model guessed — see {@link describeAssumptions}.
 */
export interface WorkingMap {
  goal?: Insight;
  deliverable?: Insight;
  constraints: Insight[];
  assumptions: Insight[];
  unknowns: Insight[];
  prerequisites: Insight[];
  risks: Insight[];
  candidateNextActions: Insight[];
}

export const EMPTY_WORKING_MAP: WorkingMap = {
  constraints: [],
  assumptions: [],
  unknowns: [],
  prerequisites: [],
  risks: [],
  candidateNextActions: [],
};

/** A search that was *suggested*. Suggesting is not running — see the research preflight. */
export interface RecommendedResearch {
  query: string;
  rationale: string;
  sourceKinds: string[];
}

/** A card the proposal intends to create. Nothing exists until the mission is accepted. */
export interface ProposedCard {
  role: SemanticRole;
  type: CardType;
  title: string;
  body: string;
  /** Which part of the map justified this card, for the proposal's own explanation. */
  origin: InsightOrigin;
}

/**
 * The reviewable draft. Its defining property is that it has created nothing —
 * {@link ProposedCard} is a description, not a card, and only
 * `CreateMissionPlanInteractor` turns one into real state.
 */
export interface MissionProposal {
  title: string;
  goalStatement: string;
  targetDeliverable: string;
  successCriteria: string[];
  constraints: Insight[];
  assumptions: Insight[];
  firstMilestone: string;
  smallestProof: string;
  prerequisites: Insight[];
  risks: Insight[];
  unknowns: Insight[];
  recommendedResearch: RecommendedResearch[];
  suggestedCards: ProposedCard[];
}

/** Merges origin-tagged additions into a map, dropping anything already present. */
export function mergeIntoWorkingMap(base: WorkingMap, additions: Partial<WorkingMap>): WorkingMap {
  const merge = (existing: Insight[], incoming: Insight[] | undefined): Insight[] => {
    if (!incoming?.length) return existing;
    const seen = new Set(existing.map(item => item.text.toLowerCase()));
    const fresh = incoming.filter(item => {
      const key = item.text.toLowerCase();
      if (!item.text || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return fresh.length ? [...existing, ...fresh] : existing;
  };

  return {
    // A user-stated goal is never overwritten by a proposed one.
    goal: base.goal ?? additions.goal,
    deliverable: base.deliverable ?? additions.deliverable,
    constraints: merge(base.constraints, additions.constraints),
    assumptions: merge(base.assumptions, additions.assumptions),
    unknowns: merge(base.unknowns, additions.unknowns),
    prerequisites: merge(base.prerequisites, additions.prerequisites),
    risks: merge(base.risks, additions.risks),
    candidateNextActions: merge(base.candidateNextActions, additions.candidateNextActions),
  };
}

const titleCase = (text: string): string =>
  text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;

/** Trims a sentence down to something that reads as a title. */
function toTitle(text: string, max = 60): string {
  const cleaned = titleCase(text.replace(/^(i want to|i'd like to|i wanna|help me)\s+/i, "").trim());
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Builds the mission proposal from the working map.
 *
 * Deterministic, so the draft exists with or without a model. Where the map is silent the
 * proposal says so in plain language rather than inventing a plausible-sounding milestone
 * — an admitted gap is useful, and a fabricated plan is worse than none.
 */
export function buildMissionProposal(
  map: WorkingMap,
  research: RecommendedResearch[] = []
): MissionProposal {
  const goalText = map.goal?.text ?? "";
  const deliverable = map.deliverable?.text ?? "";

  const smallestProof =
    map.candidateNextActions[0]?.text ??
    "Define the smallest result that would prove this is working";

  const firstMilestone = deliverable
    ? `Produce a first version of: ${deliverable}`
    : `Decide and write down what "finished" means for this goal`;

  const successCriteria = [
    deliverable ? `${deliverable} exists and works end to end` : `A written definition of "done" exists`,
    `${smallestProof} — completed and checked`,
  ];

  const suggestedCards: ProposedCard[] = [];

  if (goalText) {
    suggestedCards.push({
      role: "goal",
      type: "note",
      title: toTitle(goalText),
      body: goalText,
      origin: map.goal!.origin,
    });
  }
  if (deliverable) {
    suggestedCards.push({
      role: "deliverable",
      type: "note",
      title: toTitle(deliverable),
      body: deliverable,
      origin: map.deliverable!.origin,
    });
  }

  suggestedCards.push({
    role: "task",
    type: "note",
    title: toTitle(firstMilestone),
    body: `First milestone.\n\n${firstMilestone}`,
    origin: "app",
  });

  // An experiment card only when there is a *real* proof to run — never the app's own
  // placeholder ("Define the smallest result that would prove this is working", written
  // when the user never answered that question). Checking `[0]` for presence alone was
  // the bug: it let that placeholder get spun into "Hypothesis: Define the smallest
  // result... is achievable with what you have now" — a circular, nonsensical sentence
  // dressed up as the user's own claim. Searching for the first non-placeholder entry
  // (rather than only ever looking at index 0) also means a real proof an agent turn
  // merges in later — after the placeholder that's already sitting at the front — is
  // still found, instead of being silently shadowed by it.
  const proof = map.candidateNextActions.find(action => action.origin !== "app");
  if (proof) {
    suggestedCards.push({
      role: "experiment",
      type: "note",
      title: toTitle(`Prove it: ${proof.text}`),
      body: [
        `Hypothesis: ${proof.text} is achievable with what you have now.`,
        `Method: build the smallest version that could demonstrate it.`,
        `Measurement: does it work end to end, yes or no?`,
        `Expected result: unknown — that is why it is worth running.`,
        `Next action: if it fails, the reason becomes the next prerequisite.`,
      ].join("\n\n"),
      origin: proof.origin,
    });
  }

  for (const prerequisite of map.prerequisites) {
    suggestedCards.push({
      role: "concept",
      type: "note",
      title: toTitle(prerequisite.text),
      body: prerequisite.text,
      origin: prerequisite.origin,
    });
  }

  for (const unknown of map.unknowns) {
    suggestedCards.push({
      role: "question",
      type: "question",
      title: toTitle(unknown.text),
      body: unknown.text,
      origin: unknown.origin,
    });
  }

  return {
    title: toTitle(goalText || "Untitled mission"),
    goalStatement: goalText,
    targetDeliverable: deliverable,
    successCriteria,
    constraints: map.constraints,
    assumptions: map.assumptions,
    firstMilestone,
    smallestProof,
    prerequisites: map.prerequisites,
    risks: map.risks,
    unknowns: map.unknowns,
    recommendedResearch: research,
    suggestedCards,
  };
}

/** Renders the map's admitted gaps as the "Known gaps" note the mission carries. */
export function describeKnownGaps(map: WorkingMap): string {
  if (map.unknowns.length === 0) {
    return "No open questions were recorded when this mission was created.";
  }
  return [
    "Open at the time this mission was created:",
    ...map.unknowns.map(
      item => `- ${item.text}${item.origin === "agent" ? " (agent hypothesis — verify)" : ""}`
    ),
  ].join("\n");
}

/** Renders the map's assumptions as the "Mission assumptions" note. */
export function describeAssumptions(map: WorkingMap): string {
  if (map.assumptions.length === 0) {
    return "No assumptions were recorded when this mission was created.";
  }
  return [
    "This mission assumes the following. Correct anything that is wrong:",
    ...map.assumptions.map(item => `- ${item.text} [${item.origin}]`),
  ].join("\n");
}
