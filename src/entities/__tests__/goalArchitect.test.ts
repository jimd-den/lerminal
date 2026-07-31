import { describe, expect, it } from "bun:test";
import {
  buildMissionProposal,
  canProposeMission,
  deriveWorkingMap,
  describeAssumptions,
  describeKnownGaps,
  GoalAnswer,
  GoalQuestionId,
  mergeIntoWorkingMap,
  normalizeGoalArchitectTurn,
  recordAnswer,
  selectNextQuestion,
  EMPTY_WORKING_MAP,
  insight,
} from "../goalArchitect";

const answer = (questionId: GoalQuestionId, text: string): GoalAnswer => ({
  questionId,
  text,
  skipped: false,
  answeredAt: 1_000,
});

const skip = (questionId: GoalQuestionId): GoalAnswer => ({
  questionId,
  text: "",
  skipped: true,
  answeredAt: 1_000,
});

const texts = (items: { text: string }[]) => items.map(i => i.text);

describe("selectNextQuestion", () => {
  it("opens with the one question the flow can't proceed without", () => {
    expect(selectNextQuestion([])?.id).toBe("outcome");
  });

  it("moves on once a question has been answered", () => {
    const next = selectNextQuestion([answer("outcome", "Build a synthesizer")]);

    expect(next?.id).not.toBe("outcome");
  });

  it("never re-asks a question the user skipped", () => {
    const answers = [answer("outcome", "Build a synth"), skip("finished-result")];

    // Skipping is a decision, not an absence — asking again would ignore it.
    expect(selectNextQuestion(answers)?.id).not.toBe("finished-result");
  });

  it("skips a question the user already answered in passing", () => {
    // The deadline and the hardware are both stated up front, so asking "what constraints
    // are real?" would be asking something they just told us.
    const answers = [
      answer("outcome", "Ship a playable demo by March, solo, on a Steam Deck"),
    ];

    const asked: string[] = [];
    let current = answers;
    for (let i = 0; i < 8; i++) {
      const question = selectNextQuestion(current);
      if (!question) break;
      asked.push(question.id);
      current = recordAnswer(current, answer(question.id, "..."));
    }

    expect(asked).not.toContain("constraints");
    expect(asked).not.toContain("finished-result");
  });

  it("still asks about constraints when nothing implied them", () => {
    expect(
      selectNextQuestion([answer("outcome", "Understand category theory")])
    ).toBeTruthy();

    const asked: string[] = [];
    let current = [answer("outcome", "Understand category theory")];
    for (let i = 0; i < 8; i++) {
      const question = selectNextQuestion(current);
      if (!question) break;
      asked.push(question.id);
      current = recordAnswer(current, answer(question.id, "..."));
    }

    expect(asked).toContain("constraints");
  });

  it("runs out of questions rather than looping forever", () => {
    let current: GoalAnswer[] = [];
    for (let i = 0; i < 20; i++) {
      const question = selectNextQuestion(current);
      if (!question) break;
      current = recordAnswer(current, answer(question.id, "x"));
    }

    expect(selectNextQuestion(current)).toBeNull();
  });

  it("every question explains why it is being asked", () => {
    let current: GoalAnswer[] = [];
    for (let i = 0; i < 20; i++) {
      const question = selectNextQuestion(current);
      if (!question) break;
      expect(question.rationale.length).toBeGreaterThan(10);
      current = recordAnswer(current, answer(question.id, "x"));
    }
  });
});

describe("recordAnswer", () => {
  it("replaces a previous answer so editing one doesn't duplicate it", () => {
    const first = recordAnswer([], answer("outcome", "A game"));
    const edited = recordAnswer(first, answer("outcome", "A puzzle game"));

    expect(edited).toHaveLength(1);
    expect(edited[0].text).toBe("A puzzle game");
  });

  it("preserves other answers when one is edited", () => {
    const answers = recordAnswer(
      [answer("outcome", "A game"), answer("motivation", "Portfolio")],
      answer("outcome", "A puzzle game")
    );

    expect(answers.map(a => a.questionId).sort()).toEqual(["motivation", "outcome"]);
  });
});

describe("deriveWorkingMap", () => {
  it("works with no model and no API key at all", () => {
    const map = deriveWorkingMap([answer("outcome", "Build a modular synthesizer.")]);

    expect(map.goal?.text).toBe("Build a modular synthesizer");
    expect(map.goal?.origin).toBe("user");
  });

  it("attributes the user's own words to the user", () => {
    const map = deriveWorkingMap([
      answer("outcome", "Build a synth"),
      answer("constraints", "No budget; only weekends"),
    ]);

    expect(map.constraints.every(c => c.origin === "user")).toBe(true);
    expect(texts(map.constraints)).toEqual(["No budget", "only weekends"]);
  });

  it("marks what it inferred as the app's own reasoning, not the user's", () => {
    const map = deriveWorkingMap([answer("outcome", "Build a synth")]);

    // The user never said what "done" means; the app must not imply they did.
    const invented = map.assumptions.find(a => a.text.includes("not yet defined"));
    expect(invented?.origin).toBe("app");
  });

  it("records an undefined deliverable as an open question", () => {
    const map = deriveWorkingMap([answer("outcome", "Build a synth")]);

    expect(texts(map.unknowns)).toContain("What counts as a finished result");
  });

  it("uses the stated deliverable when there is one", () => {
    const map = deriveWorkingMap([
      answer("outcome", "Build a synth"),
      answer("finished-result", "A working 4-voice polysynth I can play live."),
    ]);

    expect(map.deliverable?.text).toBe("A working 4-voice polysynth I can play live");
    expect(map.deliverable?.origin).toBe("user");
    expect(texts(map.unknowns)).not.toContain("What counts as a finished result");
  });

  it("flags an unvalidated approach as a risk rather than a settled fact", () => {
    const map = deriveWorkingMap([
      answer("outcome", "Build a synth"),
      answer("approach", "Use analog circuits throughout"),
    ]);

    const risk = map.risks.find(r => r.text.includes("hasn't been validated"));
    expect(risk?.origin).toBe("app");
  });

  it("turns a stated blocker into both a risk and a prerequisite", () => {
    const map = deriveWorkingMap([
      answer("outcome", "Build a synth"),
      answer("blocker", "Filter design"),
    ]);

    expect(texts(map.risks)).toContain("Filter design");
    expect(map.prerequisites.some(p => p.text.includes("Filter design"))).toBe(true);
  });

  it("records skipped questions as gaps instead of quietly dropping them", () => {
    const map = deriveWorkingMap([answer("outcome", "Build a synth"), skip("constraints")]);

    expect(map.unknowns.some(u => u.text.startsWith("Skipped:"))).toBe(true);
  });

  it("never invents an agent hypothesis, having no agent to speak for", () => {
    const map = deriveWorkingMap([
      answer("outcome", "Build a synth"),
      answer("blocker", "Filters"),
      answer("approach", "Analog"),
    ]);

    const all = [
      ...map.constraints,
      ...map.assumptions,
      ...map.unknowns,
      ...map.prerequisites,
      ...map.risks,
      ...map.candidateNextActions,
    ];
    expect(all.some(i => i.origin === "agent")).toBe(false);
    expect(all.some(i => i.origin === "web")).toBe(false);
  });

  it("returns a valid map for no answers at all", () => {
    const map = deriveWorkingMap([]);

    expect(map.goal).toBeUndefined();
    expect(Array.isArray(map.unknowns)).toBe(true);
  });
});

describe("mergeIntoWorkingMap", () => {
  it("never lets a proposed goal overwrite the one the user stated", () => {
    const base = { ...EMPTY_WORKING_MAP, goal: insight("The user's goal", "user") };

    const merged = mergeIntoWorkingMap(base, { goal: insight("A model's idea", "agent") });

    expect(merged.goal?.text).toBe("The user's goal");
    expect(merged.goal?.origin).toBe("user");
  });

  it("adds agent findings alongside the user's, keeping both labelled", () => {
    const base = { ...EMPTY_WORKING_MAP, risks: [insight("Time", "user")] };

    const merged = mergeIntoWorkingMap(base, { risks: [insight("Browser support", "agent")] });

    expect(merged.risks.map(r => r.origin)).toEqual(["user", "agent"]);
  });

  it("drops a duplicate rather than listing the same finding twice", () => {
    const base = { ...EMPTY_WORKING_MAP, risks: [insight("Time", "user")] };

    const merged = mergeIntoWorkingMap(base, { risks: [insight("time", "agent")] });

    expect(merged.risks).toHaveLength(1);
    expect(merged.risks[0].origin).toBe("user");
  });
});

describe("normalizeGoalArchitectTurn", () => {
  it("labels everything a model said as an agent hypothesis", () => {
    const turn = normalizeGoalArchitectTurn({
      message: "Here's what I'd add.",
      workingMap: { risks: ["Browser support"], prerequisites: ["WGSL basics"] },
    });

    expect(turn?.workingMap.risks?.[0].origin).toBe("agent");
    expect(turn?.workingMap.prerequisites?.[0].origin).toBe("agent");
  });

  it("cannot smuggle in a finding labelled as the user's own", () => {
    const turn = normalizeGoalArchitectTurn({
      message: "ok",
      workingMap: { risks: [{ text: "Invented", origin: "user" }] },
    });

    // The origin field is stamped at this boundary, so a model's claim about it is ignored.
    expect(turn?.workingMap.risks?.[0].origin).toBe("agent");
  });

  it("rejects a turn with nothing to say and nothing to ask", () => {
    expect(normalizeGoalArchitectTurn({ workingMap: {} })).toBeNull();
  });

  it("rejects output that isn't an object at all", () => {
    expect(normalizeGoalArchitectTurn(null)).toBeNull();
    expect(normalizeGoalArchitectTurn("some prose")).toBeNull();
    expect(normalizeGoalArchitectTurn(42)).toBeNull();
  });

  it("accepts a turn that only asks a question", () => {
    const turn = normalizeGoalArchitectTurn({
      question: { id: "q1", prompt: "Which browsers must it run in?", rationale: "Scope" },
    });

    expect(turn?.question?.prompt).toBe("Which browsers must it run in?");
    expect(turn?.question?.optional).toBe(true);
  });

  it("drops a question that has no prompt rather than rendering a blank one", () => {
    const turn = normalizeGoalArchitectTurn({
      message: "Thinking.",
      question: { id: "q1", rationale: "no prompt though" },
    });

    expect(turn?.question).toBeUndefined();
  });

  it("keeps only research suggestions that name an actual query", () => {
    const turn = normalizeGoalArchitectTurn({
      message: "ok",
      recommendedResearch: [
        { query: "webgpu compute limits", rationale: "r", sourceKinds: ["spec"] },
        { rationale: "no query" },
      ],
    });

    expect(turn?.recommendedResearch).toHaveLength(1);
  });

  it("survives junk in the map fields instead of throwing", () => {
    const turn = normalizeGoalArchitectTurn({
      message: "ok",
      workingMap: { risks: "not an array", unknowns: [null, "", "real"] },
    });

    expect(turn?.workingMap.risks).toEqual([]);
    expect(texts(turn!.workingMap.unknowns!)).toEqual(["real"]);
  });
});

describe("buildMissionProposal", () => {
  const fullMap = () =>
    deriveWorkingMap([
      answer("outcome", "Build a playable puzzle game."),
      answer("finished-result", "A demo with ten levels."),
      answer("smallest-proof", "One level that plays start to finish."),
      answer("blocker", "Level generation"),
    ]);

  it("proposes cards using the roles the app already understands", () => {
    const proposal = buildMissionProposal(fullMap());

    const roles = new Set(proposal.suggestedCards.map(c => c.role));
    expect(roles.has("goal")).toBe(true);
    expect(roles.has("deliverable")).toBe(true);
    expect(roles.has("task")).toBe(true);
    expect(roles.has("experiment")).toBe(true);
  });

  it("carries each proposed card's origin through from the map", () => {
    const proposal = buildMissionProposal(fullMap());

    const goal = proposal.suggestedCards.find(c => c.role === "goal");
    expect(goal?.origin).toBe("user");
  });

  it("writes an experiment with a real method, not a placeholder", () => {
    const proposal = buildMissionProposal(fullMap());
    const experiment = proposal.suggestedCards.find(c => c.role === "experiment")!;

    expect(experiment.body).toContain("Hypothesis:");
    expect(experiment.body).toContain("Method:");
    expect(experiment.body).toContain("Measurement:");
  });

  it("omits the experiment when there is no proof to run", () => {
    const bare = { ...EMPTY_WORKING_MAP, goal: insight("Learn Rust", "user") };

    const proposal = buildMissionProposal(bare);

    // Rather than inventing a hypothesis nobody proposed.
    expect(proposal.suggestedCards.some(c => c.role === "experiment")).toBe(false);
  });

  it("admits the gap instead of inventing a deliverable", () => {
    const proposal = buildMissionProposal(
      deriveWorkingMap([answer("outcome", "Learn electronics")])
    );

    expect(proposal.targetDeliverable).toBe("");
    expect(proposal.firstMilestone).toContain('what "finished" means');
  });

  it("builds a usable proposal from the single required answer", () => {
    const proposal = buildMissionProposal(
      deriveWorkingMap([answer("outcome", "Learn to weld")])
    );

    expect(proposal.title).toBe("Learn to weld");
    expect(proposal.successCriteria.length).toBeGreaterThan(0);
    expect(proposal.suggestedCards.length).toBeGreaterThan(0);
  });

  it("strips a conversational lead-in from the title", () => {
    const proposal = buildMissionProposal(
      deriveWorkingMap([answer("outcome", "I want to build a synth")])
    );

    expect(proposal.title).toBe("Build a synth");
  });
});

describe("canProposeMission", () => {
  it("needs a real answer to the outcome question", () => {
    expect(canProposeMission([])).toBe(false);
    expect(canProposeMission([skip("outcome")])).toBe(false);
    expect(canProposeMission([answer("outcome", "Build a synth")])).toBe(true);
  });
});

describe("mission notes", () => {
  it("labels an agent-proposed gap as needing verification", () => {
    const map = mergeIntoWorkingMap(EMPTY_WORKING_MAP, {
      unknowns: [insight("Deployment target", "agent")],
    });

    expect(describeKnownGaps(map)).toContain("agent hypothesis — verify");
  });

  it("says plainly when nothing was recorded, rather than implying completeness", () => {
    expect(describeKnownGaps(EMPTY_WORKING_MAP)).toContain("No open questions");
    expect(describeAssumptions(EMPTY_WORKING_MAP)).toContain("No assumptions");
  });

  it("tags every assumption with where it came from", () => {
    const map = deriveWorkingMap([
      answer("outcome", "Build a synth"),
      answer("assets", "I have a soldering iron"),
    ]);

    expect(describeAssumptions(map)).toContain("[user]");
    expect(describeAssumptions(map)).toContain("[app]");
  });
});
