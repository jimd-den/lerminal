import { CardType, SemanticRole } from "./card";

/**
 * # Goal Architect — turning an ambition into an inspectable mission
 *
 * ## Business Value & Purpose
 * A new user arrives with something vague ("I want to make a game") and needs to leave
 * with a mission they can actually start: a deliverable, a first proof, the prerequisites
 * they hadn't thought of, and the risks worth naming out loud. This module is the pure
 * core of that conversation — the questions worth asking, what the answers imply, and the
 * shape of the proposal they produce.
 *
 * ## The rule this module exists to enforce
 * Planning prose is the easiest thing in the app to fake convincingly. So nothing here
 * stores a bare string: every finding carries an {@link InsightOrigin} saying whether the
 * *user* said it, the *app* computed it, an *agent* guessed it, or the *web* returned it.
 * Blending those four is precisely how an app starts implying a model researched something
 * it never read, and a shared `string[]` is all it would take.
 *
 * ## Why this is pure
 * Every function here is a function of its arguments. That is what makes the promise
 * "the goal flow works with no API key" a testable claim rather than a hope: the question
 * bank, the working map, and the proposal are all deterministic, and a model — when there
 * is one — only ever adds clearly-labelled material on top.
 */

/** Where a piece of the working map came from. Never inferred, always recorded. */
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

/** Ids of the questions in the bank. Stable — they are persisted with answers. */
export type GoalQuestionId =
  | "outcome"
  | "finished-result"
  | "motivation"
  | "approach"
  | "assets"
  | "constraints"
  | "smallest-proof"
  | "blocker";

/**
 * A question worth a turn of the conversation.
 *
 * `rationale` is not decoration: being asked a pointed question without knowing why it
 * matters is what makes a wizard feel like a form. Every question says what it is for.
 */
export interface GoalQuestion {
  id: GoalQuestionId;
  prompt: string;
  rationale: string;
  /** False for the one question the flow genuinely cannot proceed without. */
  optional: boolean;
}

/** The user's response to one question. */
export interface GoalAnswer {
  questionId: GoalQuestionId;
  /** Empty when {@link skipped}. */
  text: string;
  /**
   * Recorded rather than deleted, so a skipped question is never asked twice and the user
   * can still go back and fill it in.
   */
  skipped: boolean;
  answeredAt: number;
}

/**
 * The transparent assessment shown as "Working map — based on what you've told me".
 *
 * Presented to the user, not hidden model state. Every list is origin-tagged so the UI can
 * separate what was said from what was guessed.
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

/**
 * The question bank, ordered by leverage.
 *
 * Deliberately short. The spec's instruction is to ask only what materially reduces
 * ambiguity, and a bank of thirty questions makes that impossible no matter how clever the
 * selection is.
 */
export const GOAL_QUESTIONS: GoalQuestion[] = [
  {
    id: "outcome",
    prompt: "What do you want to be able to make, understand, or change?",
    rationale: "Everything else hangs off this. It's the only question I really need.",
    optional: false,
  },
  {
    id: "finished-result",
    prompt: "What would count as a concrete finished result?",
    rationale:
      "A goal you can't hold up and call done tends to expand forever. This becomes your target deliverable.",
    optional: true,
  },
  {
    id: "constraints",
    prompt: "What constraints are real — deadline, budget, hardware, collaborators, scope?",
    rationale:
      "Constraints decide what's achievable far more than ambition does, and they're cheaper to find now than halfway in.",
    optional: true,
  },
  {
    id: "assets",
    prompt: "What experience, tools, materials, or time do you already have?",
    rationale:
      "Tells me what to skip. There's no point planning prerequisites you've already met.",
    optional: true,
  },
  {
    id: "approach",
    prompt: "How do you currently imagine approaching it?",
    rationale:
      "Your intended approach surfaces the assumptions worth testing early — including the ones you don't know you're making.",
    optional: true,
  },
  {
    id: "smallest-proof",
    prompt: "What's the smallest proof that would show you're making progress?",
    rationale:
      "A first milestone you can reach in days beats a plan you abandon in weeks.",
    optional: true,
  },
  {
    id: "blocker",
    prompt: "What part feels most uncertain or most likely to block you?",
    rationale: "Names the risk worth attacking first, while it's still cheap to change course.",
    optional: true,
  },
  {
    id: "motivation",
    prompt: "Why does this matter to you right now?",
    rationale:
      "Shapes scope and pace — a portfolio piece and a personal experiment deserve different plans.",
    optional: true,
  },
];

export const findGoalQuestion = (id: GoalQuestionId): GoalQuestion | undefined =>
  GOAL_QUESTIONS.find(question => question.id === id);

/** True when the user gave this question a real answer (skips don't count). */
export function hasAnswer(answers: GoalAnswer[], id: GoalQuestionId): boolean {
  return answers.some(a => a.questionId === id && !a.skipped && a.text.trim().length > 0);
}

/** True when the question has been put to the user at all, answered or skipped. */
export function isAsked(answers: GoalAnswer[], id: GoalQuestionId): boolean {
  return answers.some(a => a.questionId === id);
}

export function answerFor(
  answers: GoalAnswer[],
  id: GoalQuestionId
): GoalAnswer | undefined {
  return answers.find(a => a.questionId === id);
}

/**
 * Records an answer, replacing any previous one for the same question.
 *
 * Replacing rather than appending is what makes "edit a previous answer" work without a
 * separate code path, and it keeps the answer list a set keyed by question.
 */
export function recordAnswer(
  answers: GoalAnswer[],
  answer: GoalAnswer
): GoalAnswer[] {
  const without = answers.filter(a => a.questionId !== answer.questionId);
  return [...without, answer];
}

/**
 * Signals that a later question is already covered by an earlier free-text answer.
 *
 * A blunt keyword check, and deliberately so: its only job is to avoid asking someone who
 * just said "by March on a Steam Deck" what their constraints are. A false negative costs
 * one extra question; anything cleverer would be unpredictable, and unpredictable question
 * selection is worse than one redundant prompt.
 */
const COVERAGE_HINTS: Partial<Record<GoalQuestionId, RegExp>> = {
  "finished-result":
    /\b(ship|ships|shipped|publish|release|finished|complete|deliver|demo|prototype|portfolio|playable|working)\b/i,
  constraints:
    /\b(deadline|by \w+|budget|\$|month|months|week|weeks|year|solo|alone|team|hardware|laptop|phone|gpu|only have|no money|part.?time)\b/i,
  assets: /\b(i know|i've used|i have|experience|familiar|already|years of|i can)\b/i,
  "smallest-proof": /\b(first|start|smallest|minimal|mvp|slice|proof|spike)\b/i,
};

/** Free-text the user has actually written, for coverage checks. */
function answeredText(answers: GoalAnswer[]): string {
  return answers
    .filter(a => !a.skipped)
    .map(a => a.text)
    .join(" \n");
}

/**
 * Picks the next question worth asking, or `null` when there's enough to propose a mission.
 *
 * The rule is "ask only what materially reduces ambiguity": a question is skipped when it
 * has already been asked, or when an earlier answer already covers it. So someone who
 * describes their deadline in their opening sentence is never asked about constraints.
 */
export function selectNextQuestion(answers: GoalAnswer[]): GoalQuestion | null {
  const text = answeredText(answers);

  for (const question of GOAL_QUESTIONS) {
    if (isAsked(answers, question.id)) continue;

    // The required question is always asked, no matter what else was volunteered.
    if (!question.optional) return question;

    const hint = COVERAGE_HINTS[question.id];
    if (hint && hint.test(text)) continue;

    return question;
  }
  return null;
}

/**
 * True once a mission proposal would be worth showing.
 *
 * One real answer to the outcome question is the floor. It is a low bar on purpose:
 * someone who wants to skip straight to a draft should be allowed to, and the draft's own
 * "assumptions" and "known gaps" sections are where the thinness becomes visible and
 * fixable.
 */
export function canProposeMission(answers: GoalAnswer[]): boolean {
  return hasAnswer(answers, "outcome");
}

const firstSentence = (text: string): string => {
  const trimmed = text.trim();
  const match = trimmed.match(/^(.{10,120}?)[.!?](\s|$)/);
  return (match ? match[1] : trimmed).trim();
};

/** Splits a free-text answer into separately-listable items. */
function listItems(text: string): string[] {
  return text
    .split(/[\n;]|,(?=\s)| and (?=\w)/i)
    .map(part => part.trim().replace(/^[-*•]\s*/, ""))
    .filter(part => part.length > 2);
}

/**
 * Builds the working map from the answers alone — no model, no network.
 *
 * This is the function that makes the whole flow usable without an API key, so it stays
 * deterministic and total: any set of answers, including none, yields a valid map. Every
 * entry it produces is tagged `user` (their own words) or `app` (something derived), never
 * `agent` — this function has no agent to speak for.
 */
export function deriveWorkingMap(answers: GoalAnswer[]): WorkingMap {
  const map: WorkingMap = {
    ...EMPTY_WORKING_MAP,
    constraints: [],
    assumptions: [],
    unknowns: [],
    prerequisites: [],
    risks: [],
    candidateNextActions: [],
  };

  const value = (id: GoalQuestionId): string => {
    const answer = answerFor(answers, id);
    return answer && !answer.skipped ? answer.text.trim() : "";
  };

  const outcome = value("outcome");
  if (outcome) map.goal = insight(firstSentence(outcome), "user");

  const finished = value("finished-result");
  if (finished) {
    map.deliverable = insight(firstSentence(finished), "user");
  } else if (outcome) {
    // Stated as an assumption rather than a deliverable, because the user has not
    // actually told us what "done" looks like and we must not put words in their mouth.
    map.assumptions.push(
      insight(`"Done" is not yet defined — I've assumed it means: ${firstSentence(outcome)}`, "app")
    );
    map.unknowns.push(insight("What counts as a finished result", "app"));
  }

  for (const item of listItems(value("constraints"))) {
    map.constraints.push(insight(item, "user"));
  }

  const assets = value("assets");
  for (const item of listItems(assets)) {
    map.assumptions.push(insight(`You already have: ${item}`, "user"));
  }
  if (!assets) {
    map.unknowns.push(insight("Your starting experience, tools, and available time", "app"));
  }

  const approach = value("approach");
  if (approach) {
    map.assumptions.push(insight(`Intended approach: ${firstSentence(approach)}`, "user"));
    // An approach chosen before the first proof is a decision made on the least
    // information you will ever have — worth flagging as a risk, not a settled fact.
    map.risks.push(
      insight("The intended approach hasn't been validated against a working proof yet", "app")
    );
  } else {
    map.unknowns.push(insight("How you intend to approach it", "app"));
  }

  const proof = value("smallest-proof");
  if (proof) {
    map.candidateNextActions.push(insight(firstSentence(proof), "user"));
  } else if (outcome) {
    map.candidateNextActions.push(
      insight("Define the smallest result that would prove this is working", "app")
    );
  }

  const blocker = value("blocker");
  if (blocker) {
    for (const item of listItems(blocker)) map.risks.push(insight(item, "user"));
    map.prerequisites.push(insight(`Understand ${firstSentence(blocker)}`, "app"));
  } else {
    map.unknowns.push(insight("Which part is most likely to block you", "app"));
  }

  const motivation = value("motivation");
  if (motivation) {
    map.assumptions.push(insight(`Why it matters now: ${firstSentence(motivation)}`, "user"));
  }

  // Every unanswered question is itself a gap, and saying so is more honest than
  // presenting a confident map built on four answers.
  for (const question of GOAL_QUESTIONS) {
    const answer = answerFor(answers, question.id);
    if (answer?.skipped) {
      map.unknowns.push(insight(`Skipped: ${question.prompt}`, "app"));
    }
  }

  return map;
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

/** A search the agent suggests. Suggesting is not running — see the research preflight. */
export interface RecommendedResearch {
  query: string;
  rationale: string;
  sourceKinds: string[];
}

/** One conversational turn from the agent, after validation. */
export interface GoalArchitectTurn {
  message: string;
  question?: {
    id: string;
    prompt: string;
    rationale: string;
    optional: boolean;
    choices?: string[];
  };
  workingMap: Partial<WorkingMap>;
  recommendedResearch?: RecommendedResearch[];
}

const asString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/** Coerces a model's array-ish field into agent-tagged insights, dropping junk. */
function asInsights(value: unknown): Insight[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => asString(typeof item === "string" ? item : (item as any)?.text))
    .filter(text => text.length > 0)
    .map(text => insight(text, "agent"));
}

/**
 * Validates and normalizes a model's turn, or returns `null` if it isn't usable.
 *
 * Two jobs, both at this one boundary. First, refuse malformed output: a half-parsed turn
 * rendered as a question the user then answers is worse than an honest failure state, and
 * the caller preserves the answers either way. Second, stamp everything the model said as
 * `origin: "agent"` on the way in — doing it here means no downstream code has to remember
 * to, and a model cannot smuggle in a finding labelled as the user's own.
 */
export function normalizeGoalArchitectTurn(raw: unknown): GoalArchitectTurn | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;

  const message = asString(source.message);
  const rawMap = (source.workingMap ?? {}) as Record<string, unknown>;
  const rawQuestion = source.question as Record<string, unknown> | undefined;

  const question =
    rawQuestion && asString(rawQuestion.prompt)
      ? {
          id: asString(rawQuestion.id) || "agent-question",
          prompt: asString(rawQuestion.prompt),
          rationale: asString(rawQuestion.rationale),
          optional: rawQuestion.optional !== false,
          choices: Array.isArray(rawQuestion.choices)
            ? rawQuestion.choices.map(asString).filter(Boolean)
            : undefined,
        }
      : undefined;

  // A turn with neither something to say nor something to ask is not a turn.
  if (!message && !question) return null;

  const goalText = asString(rawMap.goal);
  const deliverableText = asString(rawMap.deliverable);

  const research = Array.isArray(source.recommendedResearch)
    ? source.recommendedResearch
        .map((item: any) => ({
          query: asString(item?.query),
          rationale: asString(item?.rationale),
          sourceKinds: Array.isArray(item?.sourceKinds)
            ? item.sourceKinds.map(asString).filter(Boolean)
            : [],
        }))
        .filter(item => item.query.length > 0)
    : [];

  return {
    message,
    question,
    workingMap: {
      goal: goalText ? insight(goalText, "agent") : undefined,
      deliverable: deliverableText ? insight(deliverableText, "agent") : undefined,
      constraints: asInsights(rawMap.constraints),
      assumptions: asInsights(rawMap.assumptions),
      unknowns: asInsights(rawMap.unknowns),
      prerequisites: asInsights(rawMap.prerequisites),
      risks: asInsights(rawMap.risks),
      candidateNextActions: asInsights(rawMap.candidateNextActions),
    },
    recommendedResearch: research.length ? research : undefined,
  };
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
 * The reviewable draft. Its defining property is that it has created nothing — the UI
 * states that outright, and {@link ProposedCard} is a description, not a card.
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

  // An experiment card only when there is a real proof to run. A placeholder experiment
  // with an invented hypothesis would be exactly the fabricated rigour to avoid.
  if (map.candidateNextActions.length > 0) {
    const proof = map.candidateNextActions[0];
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
    ...map.unknowns.map(item => `- ${item.text}${item.origin === "agent" ? " (agent hypothesis — verify)" : ""}`),
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
