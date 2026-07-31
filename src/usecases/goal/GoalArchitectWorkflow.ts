import {
  buildMissionProposal,
  canProposeMission,
  deriveWorkingMap,
  GoalAnswer,
  GoalQuestion,
  GoalQuestionId,
  MissionProposal,
  mergeIntoWorkingMap,
  normalizeGoalArchitectTurn,
  recordAnswer,
  RecommendedResearch,
  selectNextQuestion,
  WorkingMap,
  EMPTY_WORKING_MAP,
} from "../../entities/goalArchitect";
import { AgentGateway } from "../ports/gateways/AgentGateway";

/**
 * # Goal Architect Workflow
 *
 * ## Business Value & Purpose
 * Runs the conversation that turns "I want to make a game" into a mission worth starting:
 * asks one question at a time, keeps a transparent working map of what it has understood,
 * and produces a reviewable proposal that has created nothing yet.
 *
 * ## The deterministic spine
 * Every stage here works with **no API key**. Questions, the working map, and the proposal
 * are pure functions of the user's answers (see `entities/goalArchitect`). A model, when
 * one is configured, is an optional enrichment that adds clearly-labelled hypotheses — it
 * is never on the critical path. That ordering is deliberate: a first-run experience that
 * dead-ends without a key is a first-run experience most people never finish.
 *
 * ## Two things this workflow will not do
 * It never searches. It can *recommend* queries and hand them to the host for the normal
 * research preflight, but the actual search belongs to `SearchGateway` behind an explicit
 * user approval, so the agent can never claim to have read something it didn't.
 *
 * It never loses answers. Every failure path — no key, no model support, a network error,
 * malformed output — sets an actionable error and leaves `answers` untouched. Discarding
 * eight answers because one request failed is the bug that makes people stop trusting a
 * flow like this.
 */

export type GoalArchitectStage =
  /** Asking questions and building the map. */
  | "intent"
  /** A draft mission is on screen. Nothing has been created. */
  | "proposal";

/** A question from the model, which carries no stable id from the app's bank. */
export interface AgentQuestion {
  prompt: string;
  rationale: string;
  choices?: string[];
}

export interface GoalArchitectState {
  isOpen: boolean;
  stage: GoalArchitectStage;
  answers: GoalAnswer[];
  /** The transparent assessment shown as "Working map — based on what you've told me". */
  map: WorkingMap;
  /** The next question from the app's bank, or null when the bank is exhausted. */
  question: GoalQuestion | null;
  /** A model's follow-up question, shown as an agent turn rather than as the app asking. */
  agentQuestion: AgentQuestion | null;
  /** The model's prose for this turn, if any. */
  agentMessage: string | null;
  /**
   * An actionable failure. Set when a model was asked for and could not be used; the
   * conversation continues deterministically either way.
   */
  agentError: string | null;
  isAgentThinking: boolean;
  proposal: MissionProposal | null;
  /** Queries the agent suggested. Suggested is not run — see {@link requestResearch}. */
  recommendedResearch: RecommendedResearch[];
  /** True once a real, user-approved search has happened during this session. */
  webUsed: boolean;
  /** True when a model contributed to the current map. Drives the receipt's honesty. */
  modelUsed: boolean;
  /**
   * True when this session opened itself on a first launch rather than being asked for.
   * The sheet uses it to offer "Start blank instead" in place of a bare close, so an
   * uninvited sheet always names the way out.
   */
  isFirstRun: boolean;
}

export const INITIAL_GOAL_ARCHITECT_STATE: GoalArchitectState = {
  isOpen: false,
  stage: "intent",
  answers: [],
  map: EMPTY_WORKING_MAP,
  question: null,
  agentQuestion: null,
  agentMessage: null,
  agentError: null,
  isAgentThinking: false,
  proposal: null,
  recommendedResearch: [],
  webUsed: false,
  modelUsed: false,
  isFirstRun: false,
};

export interface GoalArchitectHost {
  apiKey(): string;
  model(): string;
  /**
   * The instruction the conversation runs with — resolved from the user-editable "Goal
   * Architect" assistant profile, so this workflow never carries a hardcoded prompt of
   * its own and the conversation's behavior is as configurable as any other capability.
   */
  systemPrompt(): string;
  onChange(): void;
  /**
   * Opens the normal research preflight with these queries. The host is responsible for
   * showing the exact queries and requiring approval; this workflow never searches.
   */
  requestResearchApproval(queries: RecommendedResearch[]): void;
}

export interface GoalArchitectWorkflowDeps {
  host: GoalArchitectHost;
  /** Optional: the flow is fully usable without one. */
  agentGateway?: AgentGateway;
}

export class GoalArchitectWorkflow {
  private current: GoalArchitectState = { ...INITIAL_GOAL_ARCHITECT_STATE };

  constructor(private readonly deps: GoalArchitectWorkflowDeps) {}

  get state(): GoalArchitectState {
    return this.current;
  }

  private patch(changes: Partial<GoalArchitectState>): void {
    this.current = { ...this.current, ...changes };
    this.deps.host.onChange();
  }

  /** Opens a fresh session. Any previous session's answers are deliberately discarded. */
  open(): void {
    this.current = {
      ...INITIAL_GOAL_ARCHITECT_STATE,
      isOpen: true,
      question: selectNextQuestion([]),
    };
    this.deps.host.onChange();
  }

  /** Marks this session as one the app opened on its own. See {@link GoalArchitectState.isFirstRun}. */
  markFirstRun(): void {
    this.patch({ isFirstRun: true });
  }

  close(): void {
    this.patch({ isOpen: false });
  }

  /**
   * Records an answer to the current question and moves on.
   *
   * Answering the model's follow-up is recorded against the app question it stood in for,
   * so a model-authored question still ends up in the same durable answer list rather than
   * in a parallel one only the model can see.
   */
  submitAnswer(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;

    const questionId = this.currentQuestionId();
    if (!questionId) return;

    this.advanceWith(
      recordAnswer(this.current.answers, {
        questionId,
        text: trimmed,
        skipped: false,
        answeredAt: Date.now(),
      })
    );
  }

  /** Skips the current question, recording the skip so it is never asked again. */
  skipCurrent(): void {
    const questionId = this.currentQuestionId();
    if (!questionId) return;

    this.advanceWith(
      recordAnswer(this.current.answers, {
        questionId,
        text: "",
        skipped: true,
        answeredAt: Date.now(),
      })
    );
  }

  /** Revises an earlier answer, rebuilding the map from the corrected set. */
  editAnswer(questionId: GoalQuestionId, text: string): void {
    this.advanceWith(
      recordAnswer(this.current.answers, {
        questionId,
        text: text.trim(),
        skipped: text.trim().length === 0,
        answeredAt: Date.now(),
      }),
      { keepStage: true }
    );
  }

  private currentQuestionId(): GoalQuestionId | null {
    // An agent follow-up is answered on behalf of whichever app question is outstanding,
    // so its answer is stored under a stable id rather than a model-invented one.
    return this.current.question?.id ?? null;
  }

  /**
   * Rebuilds the map from the answers and picks the next question.
   *
   * The map is always recomputed from scratch rather than patched, so editing an earlier
   * answer can *remove* a finding it had caused. Anything a model contributed is layered
   * back on top and stays labelled.
   */
  private advanceWith(
    answers: GoalAnswer[],
    options: { keepStage?: boolean } = {}
  ): void {
    const derived = deriveWorkingMap(answers);
    const map = mergeIntoWorkingMap(derived, this.agentContributions());
    const question = selectNextQuestion(answers);

    this.patch({
      answers,
      map,
      question,
      agentQuestion: null,
      // Stale prose from the previous turn would read as a response to this answer.
      agentMessage: null,
      proposal:
        options.keepStage && this.current.stage === "proposal"
          ? buildMissionProposal(map, this.current.recommendedResearch)
          : this.current.proposal,
    });
  }

  /**
   * The agent-origin entries currently in the map, so they survive a rebuild.
   *
   * Kept by filtering the live map rather than in a second field: one place holds the
   * findings, and "who said it" is a property of each entry instead of a parallel list
   * that could drift out of step with it.
   */
  private agentContributions(): Partial<WorkingMap> {
    const agentOnly = (items: { origin: string }[]) =>
      items.filter(item => item.origin === "agent" || item.origin === "web") as any;

    return {
      constraints: agentOnly(this.current.map.constraints),
      assumptions: agentOnly(this.current.map.assumptions),
      unknowns: agentOnly(this.current.map.unknowns),
      prerequisites: agentOnly(this.current.map.prerequisites),
      risks: agentOnly(this.current.map.risks),
      candidateNextActions: agentOnly(this.current.map.candidateNextActions),
    };
  }

  /**
   * Asks the model for a turn: missing considerations, a follow-up question, and queries
   * worth running. Everything it returns is labelled as a hypothesis to verify.
   *
   * Explicitly invoked, never automatic — a model call the user didn't ask for is exactly
   * the kind of invisible agent behaviour this app is built to avoid.
   */
  async requestAgentTurn(): Promise<void> {
    const apiKey = this.deps.host.apiKey().trim();
    const gateway = this.deps.agentGateway;

    if (!apiKey) {
      this.patch({
        agentError:
          "No API key is set, so I can't ask a model for suggestions. Everything else here still works — add a key in Settings to enable this.",
      });
      return;
    }
    if (!gateway?.designGoalArchitectTurn) {
      this.patch({
        agentError: "This build has no model connection for goal planning.",
      });
      return;
    }

    this.patch({ isAgentThinking: true, agentError: null });

    try {
      const raw = await gateway.designGoalArchitectTurn({
        briefing: this.briefing(),
        apiKey,
        model: this.deps.host.model(),
        systemPrompt: this.deps.host.systemPrompt(),
      });

      const turn = normalizeGoalArchitectTurn(raw);
      if (!turn) {
        // The answers are untouched; the user loses a suggestion, not their work.
        this.patch({
          isAgentThinking: false,
          agentError:
            "The model's reply didn't come back in a usable shape. Your answers are safe — try again, or carry on without it.",
        });
        return;
      }

      const map = mergeIntoWorkingMap(this.current.map, turn.workingMap);
      this.patch({
        isAgentThinking: false,
        map,
        agentMessage: turn.message || null,
        agentQuestion: turn.question
          ? {
              prompt: turn.question.prompt,
              rationale: turn.question.rationale,
              choices: turn.question.choices,
            }
          : null,
        recommendedResearch: turn.recommendedResearch ?? this.current.recommendedResearch,
        modelUsed: true,
        proposal:
          this.current.stage === "proposal"
            ? buildMissionProposal(map, turn.recommendedResearch ?? this.current.recommendedResearch)
            : this.current.proposal,
      });
    } catch (error: any) {
      this.patch({
        isAgentThinking: false,
        agentError: `Couldn't reach the model: ${error?.message ?? "unknown error"}. Your answers are safe.`,
      });
    }
  }

  /** True once there's enough to draft a mission. */
  get canPropose(): boolean {
    return canProposeMission(this.current.answers);
  }

  /**
   * Builds the draft mission and shows it.
   *
   * Creates nothing — the proposal is a description, and only accepting it writes cards.
   */
  proposeMission(): void {
    if (!this.canPropose) return;

    this.patch({
      stage: "proposal",
      proposal: buildMissionProposal(this.current.map, this.current.recommendedResearch),
    });
  }

  /** Returns from the draft to answering questions, keeping every answer. */
  backToQuestions(): void {
    this.patch({ stage: "intent", question: selectNextQuestion(this.current.answers) });
  }

  /**
   * Hands the recommended queries to the host's research preflight.
   *
   * This is the whole extent of this workflow's involvement with the web: it proposes, the
   * user approves, and `SearchGateway` searches. Nothing here can cause a request.
   */
  requestResearch(): void {
    const queries = this.current.recommendedResearch;
    if (queries.length === 0) return;
    this.deps.host.requestResearchApproval(queries);
  }

  /** Recorded by the host after a real, approved search, so the receipt can say so. */
  markWebUsed(): void {
    this.patch({ webUsed: true });
  }

  /**
   * The bounded briefing sent to the model.
   *
   * Assembled from the answers and the map only — never the whole workspace. The user's
   * own words are marked as theirs so the model is told, in the prompt itself, which
   * material it is allowed to treat as fact.
   */
  private briefing(): string {
    const lines: string[] = ["The user's answers so far:"];

    for (const answer of this.current.answers) {
      lines.push(
        answer.skipped
          ? `- [${answer.questionId}] (skipped)`
          : `- [${answer.questionId}] ${answer.text}`
      );
    }

    const map = this.current.map;
    const section = (label: string, items: { text: string }[]) => {
      if (items.length === 0) return;
      lines.push(`\n${label}:`);
      for (const item of items) lines.push(`- ${item.text}`);
    };

    if (map.goal) lines.push(`\nGoal: ${map.goal.text}`);
    if (map.deliverable) lines.push(`Deliverable: ${map.deliverable.text}`);
    section("Constraints", map.constraints);
    section("Assumptions", map.assumptions);
    section("Open questions", map.unknowns);
    section("Prerequisites", map.prerequisites);
    section("Risks", map.risks);

    return lines.join("\n");
  }
}
