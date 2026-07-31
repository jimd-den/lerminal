import { describe, expect, it } from "bun:test";
import { presentGoalArchitect } from "../GoalArchitectPresenter";
import {
  GoalArchitectState,
  INITIAL_GOAL_ARCHITECT_STATE,
} from "../../../usecases/goal/GoalArchitectWorkflow";
import {
  deriveWorkingMap,
  EMPTY_WORKING_MAP,
  GoalAnswer,
  GoalQuestionId,
  insight,
  mergeIntoWorkingMap,
  findGoalQuestion,
} from "../../../entities/goalArchitect";

const answer = (questionId: GoalQuestionId, text: string): GoalAnswer => ({
  questionId,
  text,
  skipped: false,
  answeredAt: 0,
});

const skip = (questionId: GoalQuestionId): GoalAnswer => ({
  questionId,
  text: "",
  skipped: true,
  answeredAt: 0,
});

const state = (overrides: Partial<GoalArchitectState> = {}): GoalArchitectState => ({
  ...INITIAL_GOAL_ARCHITECT_STATE,
  isOpen: true,
  ...overrides,
});

describe("presentGoalArchitect", () => {
  it("labels a model's suggestion as a hypothesis to verify", () => {
    const map = mergeIntoWorkingMap(EMPTY_WORKING_MAP, {
      risks: [insight("Browser support", "agent")],
    });

    const view = presentGoalArchitect(state({ map }), true);

    const row = view.mapSections.find(s => s.heading === "RISKS")!.rows[0];
    expect(row.label).toBe("AGENT HYPOTHESIS — VERIFY OR EDIT");
    expect(row.needsVerification).toBe(true);
  });

  it("gives the user's own words no badge and nothing to verify", () => {
    const map = deriveWorkingMap([answer("outcome", "Build a synth")]);

    const view = presentGoalArchitect(state({ map }), true);

    const goal = view.mapSections.find(s => s.heading === "GOAL")!.rows[0];
    expect(goal.label).toBe("");
    expect(goal.needsVerification).toBe(false);
  });

  it("distinguishes the app's own derivation from both", () => {
    const map = deriveWorkingMap([answer("outcome", "Build a synth")]);

    const view = presentGoalArchitect(state({ map }), true);

    const assumptions = view.mapSections.find(s => s.heading === "ASSUMPTIONS")!;
    expect(assumptions.rows[0].label).toBe("FROM YOUR ANSWERS");
    expect(assumptions.rows[0].needsVerification).toBe(false);
  });

  it("hides empty sections rather than rendering blank headings", () => {
    const view = presentGoalArchitect(state({ map: EMPTY_WORKING_MAP }), false);

    expect(view.mapSections).toEqual([]);
  });

  it("reports whether a model contributed anything at all", () => {
    const clean = presentGoalArchitect(
      state({ map: deriveWorkingMap([answer("outcome", "x")]) }),
      true
    );
    expect(clean.hasAgentContributions).toBe(false);

    const withAgent = presentGoalArchitect(
      state({
        map: mergeIntoWorkingMap(EMPTY_WORKING_MAP, { risks: [insight("r", "agent")] }),
      }),
      true
    );
    expect(withAgent.hasAgentContributions).toBe(true);
  });

  it("says no model was used when none was", () => {
    const view = presentGoalArchitect(state({ modelUsed: false, webUsed: false }), true);

    expect(view.provenanceSummary).toContain("No model was used");
    expect(view.provenanceSummary).toContain("web was not searched");
  });

  it("says a model contributed once one has", () => {
    const view = presentGoalArchitect(state({ modelUsed: true }), true);

    expect(view.provenanceSummary).toContain("A model contributed");
  });

  it("states outright that the draft has created nothing", () => {
    const view = presentGoalArchitect(state({ stage: "proposal" }), true);

    expect(view.proposalStatus).toContain("NOTHING HAS BEEN CREATED YET");
  });

  it("shows the app's question with its rationale", () => {
    const view = presentGoalArchitect(
      state({ question: findGoalQuestion("outcome")! }),
      false
    );

    expect(view.prompt).toContain("What do you want to be able to make");
    expect(view.rationale!.length).toBeGreaterThan(10);
    expect(view.isAgentQuestion).toBe(false);
  });

  it("prefers the model's follow-up and marks it as the agent's", () => {
    const view = presentGoalArchitect(
      state({
        question: findGoalQuestion("motivation")!,
        agentQuestion: {
          prompt: "Which browsers must it run in?",
          rationale: "Scope",
          choices: ["Chrome only", "All modern"],
        },
      }),
      true
    );

    expect(view.prompt).toBe("Which browsers must it run in?");
    expect(view.isAgentQuestion).toBe(true);
    expect(view.choices).toEqual(["Chrome only", "All modern"]);
  });

  it("won't offer to skip the one required question", () => {
    const required = presentGoalArchitect(
      state({ question: findGoalQuestion("outcome")! }),
      false
    );
    expect(required.canSkip).toBe(false);

    const optional = presentGoalArchitect(
      state({ question: findGoalQuestion("motivation")! }),
      true
    );
    expect(optional.canSkip).toBe(true);
  });

  it("passes a model failure through for the UI to show", () => {
    const view = presentGoalArchitect(
      state({ agentError: "Couldn't reach the model: offline. Your answers are safe." }),
      true
    );

    expect(view.agentError).toContain("answers are safe");
  });

  it("rebuilds the conversation as alternating assistant/user lines, in order", () => {
    const answers = [answer("outcome", "Build a synth"), answer("motivation", "For fun")];
    const view = presentGoalArchitect(state({ answers }), true);

    expect(view.transcript.map(e => e.speaker)).toEqual([
      "assistant",
      "user",
      "assistant",
      "user",
    ]);
    expect(view.transcript[0].text).toBe(findGoalQuestion("outcome")!.prompt);
    expect(view.transcript[1].text).toBe("Build a synth");
  });

  it("shows a skipped question honestly rather than inventing an answer", () => {
    const view = presentGoalArchitect(state({ answers: [skip("motivation")] }), true);

    expect(view.transcript[1]).toEqual({
      speaker: "user",
      text: "(skipped)",
      skipped: true,
    });
  });

  it("has an empty transcript before anything has been answered", () => {
    expect(presentGoalArchitect(state({ answers: [] }), false).transcript).toEqual([]);
  });

  it("condenses the log to one tagged line per turn, not the question replayed", () => {
    const answers = [answer("outcome", "Build a synth"), answer("motivation", "For fun")];
    const view = presentGoalArchitect(state({ answers }), true);

    expect(view.logEntries).toEqual([
      { tag: "OUTCOME", text: "Build a synth", skipped: false },
      { tag: "MOTIVATION", text: "For fun", skipped: false },
    ]);
    // The log never repeats the assistant's own prompt text.
    for (const entry of view.logEntries) {
      expect(entry.text).not.toBe(findGoalQuestion("outcome")!.prompt);
    }
  });

  it("marks a skipped question in the log honestly", () => {
    const view = presentGoalArchitect(state({ answers: [skip("motivation")] }), true);

    expect(view.logEntries).toEqual([{ tag: "MOTIVATION", text: "skipped", skipped: true }]);
  });

  it("carries the web-search toggle and citations straight through", () => {
    const view = presentGoalArchitect(
      state({
        webSearchEnabled: true,
        webCitations: [{ url: "https://example.com", title: "Example" }],
      }),
      true,
    );

    expect(view.webSearchEnabled).toBe(true);
    expect(view.webCitations).toEqual([{ url: "https://example.com", title: "Example" }]);
  });

  it("says web results were used once webUsed is true", () => {
    const view = presentGoalArchitect(state({ webUsed: true }), true);

    expect(view.provenanceSummary).toContain("Web results were used");
  });
});
