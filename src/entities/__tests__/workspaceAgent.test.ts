import { describe, expect, it } from "bun:test";
import {
  AgentToolIntent,
  narrowToolIntent,
  normalizeWorkspaceAgentResponse,
  toolIntentItems,
} from "../workspaceAgent";

const VALID_IDS = new Set(["c1", "c2", "c3"]);

describe("normalizeWorkspaceAgentResponse", () => {
  it("rejects non-object/malformed input", () => {
    expect(normalizeWorkspaceAgentResponse(null, VALID_IDS)).toBeNull();
    expect(normalizeWorkspaceAgentResponse(undefined, VALID_IDS)).toBeNull();
    expect(normalizeWorkspaceAgentResponse("just a string", VALID_IDS)).toBeNull();
    expect(normalizeWorkspaceAgentResponse(42, VALID_IDS)).toBeNull();
    expect(normalizeWorkspaceAgentResponse([], VALID_IDS)).toBeNull();
  });

  it("rejects a turn with no message, no proposals, and no question", () => {
    expect(normalizeWorkspaceAgentResponse({}, VALID_IDS)).toBeNull();
    expect(normalizeWorkspaceAgentResponse({ message: "" }, VALID_IDS)).toBeNull();
  });

  it("passes through a bare message unchanged", () => {
    const result = normalizeWorkspaceAgentResponse({ message: "Hello there" }, VALID_IDS);
    expect(result).toEqual({ message: "Hello there", proposedActions: [] });
  });

  it("passes through a question-only turn", () => {
    const result = normalizeWorkspaceAgentResponse(
      { message: "", question: { prompt: "Which group?", rationale: "ambiguous" } },
      VALID_IDS
    );
    expect(result).toEqual({
      message: "",
      proposedActions: [],
      question: { prompt: "Which group?", rationale: "ambiguous" },
    });
  });

  it("rejects proposedActions that isn't an array", () => {
    expect(
      normalizeWorkspaceAgentResponse({ message: "hi", proposedActions: "nope" }, VALID_IDS)
    ).toBeNull();
  });

  /**
   * A malformed action is *discarded*, never surfaced — but it does not cost the user
   * the reply it arrived with. The safety property under test is that the bad action
   * can never reach `proposedActions` (and so can never be dispatched); the usability
   * property is that a plain answer still gets through.
   */
  const expectActionDiscarded = (raw: unknown) => {
    const result = normalizeWorkspaceAgentResponse(raw, VALID_IDS);
    expect(result).not.toBeNull();
    expect(result!.message).toBe("hi");
    expect(result!.proposedActions).toEqual([]);
    expect(result!.discardedActions).toBe(1);
  };

  it("discards an unknown tool type without losing the reply", () => {
    expectActionDiscarded({
      message: "hi",
      proposedActions: [
        {
          id: "p1",
          label: "Do something",
          explanation: "because",
          tool: { type: "delete_workspace" },
        },
      ],
    });
  });

  it("discards a tool referencing a card id that isn't in validCardIds", () => {
    expectActionDiscarded({
      message: "hi",
      proposedActions: [
        {
          id: "p1",
          label: "Extract",
          explanation: "has a link",
          tool: { type: "extract_url", cardId: "does-not-exist" },
        },
      ],
    });
  });

  it("discards create_cards with a malformed card (bad type, missing title/body)", () => {
    expectActionDiscarded({
      message: "hi",
      proposedActions: [
        {
          id: "p1",
          label: "Create",
          explanation: "worth capturing",
          tool: { type: "create_cards", cards: [{ type: "not-a-real-type", title: "T", body: "B" }] },
        },
      ],
    });

    expectActionDiscarded({
      message: "hi",
      proposedActions: [
        {
          id: "p1",
          label: "Create",
          explanation: "worth capturing",
          tool: { type: "create_cards", cards: [{ type: "note", title: "T" }] },
        },
      ],
    });
  });

  it("discards create_group / chunk_cards / make_study_candidates referencing missing card ids", () => {
    expectActionDiscarded({
      message: "hi",
      proposedActions: [
        {
          id: "p1",
          label: "Group",
          explanation: "related",
          tool: { type: "create_group", name: "New group", cardIds: ["c1", "missing"] },
        },
      ],
    });

    expectActionDiscarded({
      message: "hi",
      proposedActions: [
        {
          id: "p1",
          label: "Chunk",
          explanation: "long source",
          tool: { type: "chunk_cards", cardIds: ["missing"], mode: "deterministic" },
        },
      ],
    });

    expectActionDiscarded({
      message: "hi",
      proposedActions: [
        {
          id: "p1",
          label: "Study",
          explanation: "ready to review",
          tool: { type: "make_study_candidates", cardIds: ["missing"], mode: "recall" },
        },
      ],
    });
  });

  it("treats a null proposedActions as plain conversation, not a malformed turn", () => {
    // The `json_object` fallback (models without structured-output support) has no
    // schema forcing an array here, and a model that is simply answering emits null.
    const result = normalizeWorkspaceAgentResponse(
      { message: "Here's the answer.", proposedActions: null },
      VALID_IDS
    );
    expect(result).not.toBeNull();
    expect(result!.message).toBe("Here's the answer.");
    expect(result!.proposedActions).toEqual([]);
    expect(result!.discardedActions).toBeUndefined();
  });

  it("still rejects a turn whose only content was an unusable action", () => {
    // Nothing survives: no message, no question, and the one action was malformed.
    expect(
      normalizeWorkspaceAgentResponse(
        {
          message: "",
          proposedActions: [
            { id: "p1", label: "X", explanation: "y", tool: { type: "delete_workspace" } },
          ],
        },
        VALID_IDS
      )
    ).toBeNull();
  });

  it("passes through a valid response with multiple proposals unchanged (modulo generated ids)", () => {
    const raw = {
      message: "Here's what I'd do.",
      observation: "Several notes look related.",
      proposedActions: [
        {
          id: "p1",
          label: "Group these",
          explanation: "They're all about the same topic",
          requiresConfirmation: true,
          tool: { type: "create_group", name: "Topic", cardIds: ["c1", "c2"] },
        },
        {
          id: "p2",
          label: "Ask a follow-up",
          explanation: "It's ambiguous",
          tool: { type: "ask_clarifying_question", question: "What's the deadline?" },
        },
      ],
    };

    const result = normalizeWorkspaceAgentResponse(raw, VALID_IDS);

    expect(result).toEqual({
      message: "Here's what I'd do.",
      observation: "Several notes look related.",
      proposedActions: [
        {
          id: "p1",
          label: "Group these",
          explanation: "They're all about the same topic",
          requiresConfirmation: true,
          tool: { type: "create_group", name: "Topic", cardIds: ["c1", "c2"] },
        },
        {
          id: "p2",
          label: "Ask a follow-up",
          explanation: "It's ambiguous",
          requiresConfirmation: true,
          tool: { type: "ask_clarifying_question", question: "What's the deadline?" },
        },
      ],
    });
  });

  it("discards every proposal when one of several is malformed, but keeps the reply", () => {
    // The all-or-nothing rule for *actions* is deliberate: one bad proposal means the
    // model isn't trusted on the rest, which would otherwise run against real cards.
    // The reply itself survives, because losing a plain answer over an unusable action
    // is a worse failure than showing no actions.
    const raw = {
      message: "ok",
      proposedActions: [
        {
          id: "p1",
          label: "Fine",
          explanation: "fine",
          tool: { type: "extract_url", cardId: "c1" },
        },
        {
          id: "p2",
          label: "Bad",
          explanation: "bad",
          tool: { type: "extract_url", cardId: "missing" },
        },
      ],
    };

    const result = normalizeWorkspaceAgentResponse(raw, VALID_IDS);
    expect(result).not.toBeNull();
    expect(result!.message).toBe("ok");
    // The well-formed sibling is dropped too — that is the trust rule, not an oversight.
    expect(result!.proposedActions).toEqual([]);
    expect(result!.discardedActions).toBe(2);
  });
});

/**
 * Plain conversation is the baseline: a turn that proposes nothing is a normal, complete
 * turn, not a degraded one.
 */
describe("normalizeWorkspaceAgentResponse — conversation without proposals", () => {
  it("accepts an explicitly empty proposedActions array", () => {
    const turn = normalizeWorkspaceAgentResponse(
      { message: "Your notes mostly circle one question.", proposedActions: [] },
      VALID_IDS,
    );
    expect(turn).not.toBeNull();
    expect(turn!.message).toBe("Your notes mostly circle one question.");
    expect(turn!.proposedActions).toEqual([]);
  });

  it("accepts a turn with the proposedActions key absent entirely", () => {
    const turn = normalizeWorkspaceAgentResponse({ message: "Yes — for two reasons." }, VALID_IDS);
    expect(turn).not.toBeNull();
    expect(turn!.proposedActions).toEqual([]);
  });
});

describe("toolIntentItems", () => {
  it("exposes one item per member for the multi-item intents", () => {
    expect(
      toolIntentItems({
        type: "create_cards",
        cards: [
          { type: "note", title: "A", body: "body a" },
          { type: "note", title: "B", body: "body b" },
        ],
      })!.map(i => i.key),
    ).toEqual(["card-0", "card-1"]);

    expect(
      toolIntentItems({ type: "create_group", name: "G", cardIds: ["c1", "c2"] })!.map(i => i.key),
    ).toEqual(["c1", "c2"]);

    expect(
      toolIntentItems({ type: "search_web", queries: ["q1", "q2"], purpose: "p" })!.map(i => i.key),
    ).toEqual(["query-0", "query-1"]);
  });

  it("returns null for single-target and informational intents", () => {
    expect(toolIntentItems({ type: "extract_url", cardId: "c1" })).toBeNull();
    expect(
      toolIntentItems({ type: "link_cards", sourceCardId: "c1", targetCardId: "c2" }),
    ).toBeNull();
    expect(toolIntentItems({ type: "draft_experiment", cardIds: ["c1"] })).toBeNull();
    expect(toolIntentItems({ type: "ask_clarifying_question", question: "which?" })).toBeNull();
    expect(toolIntentItems({ type: "suggest_next_actions", suggestions: ["a"] })).toBeNull();
  });
});

describe("narrowToolIntent", () => {
  it("narrows create_cards to the selected cards, preserving order and fields", () => {
    const tool: AgentToolIntent = {
      type: "create_cards",
      cards: [
        { type: "note", title: "A", body: "body a" },
        { type: "note", title: "B", body: "body b" },
        { type: "question", title: "C", body: "body c", answer: "yes" },
      ],
    };

    expect(narrowToolIntent(tool, ["card-0", "card-2"])).toEqual({
      type: "create_cards",
      cards: [
        { type: "note", title: "A", body: "body a" },
        { type: "question", title: "C", body: "body c", answer: "yes" },
      ],
    });
  });

  it("narrows create_group to a subset of cardIds, keeping name and parent", () => {
    const tool: AgentToolIntent = {
      type: "create_group",
      name: "Cluster",
      cardIds: ["c1", "c2", "c3"],
      parentId: null,
    };

    expect(narrowToolIntent(tool, ["c1", "c3"])).toEqual({
      type: "create_group",
      name: "Cluster",
      cardIds: ["c1", "c3"],
      parentId: null,
    });
  });

  it("narrows chunk_cards and make_study_candidates while keeping their mode", () => {
    expect(
      narrowToolIntent(
        { type: "chunk_cards", cardIds: ["c1", "c2"], mode: "deterministic" },
        ["c2"],
      ),
    ).toEqual({ type: "chunk_cards", cardIds: ["c2"], mode: "deterministic" });

    expect(
      narrowToolIntent(
        { type: "make_study_candidates", cardIds: ["c1", "c2", "c3"], mode: "cloze" },
        ["c1", "c2"],
      ),
    ).toEqual({ type: "make_study_candidates", cardIds: ["c1", "c2"], mode: "cloze" });
  });

  it("drops unselected search queries so a bad query never runs", () => {
    expect(
      narrowToolIntent(
        { type: "search_web", queries: ["good", "bad", "also good"], purpose: "why" },
        ["query-0", "query-2"],
      ),
    ).toEqual({ type: "search_web", queries: ["good", "also good"], purpose: "why" });
  });

  it("returns null when everything is deselected — an empty group or zero queries never dispatches", () => {
    expect(
      narrowToolIntent({ type: "create_group", name: "G", cardIds: ["c1"] }, []),
    ).toBeNull();
    expect(
      narrowToolIntent(
        { type: "create_cards", cards: [{ type: "note", title: "A", body: "b" }] },
        [],
      ),
    ).toBeNull();
    expect(
      narrowToolIntent({ type: "search_web", queries: ["q"], purpose: "p" }, []),
    ).toBeNull();
  });

  it("passes single-target and informational intents through unchanged", () => {
    const extract: AgentToolIntent = { type: "extract_url", cardId: "c1" };
    expect(narrowToolIntent(extract, [])).toBe(extract);

    const link: AgentToolIntent = { type: "link_cards", sourceCardId: "c1", targetCardId: "c2" };
    expect(narrowToolIntent(link, [])).toBe(link);

    const experiment: AgentToolIntent = { type: "draft_experiment", cardIds: ["c1", "c2"] };
    expect(narrowToolIntent(experiment, ["c1"])).toBe(experiment);

    const ask: AgentToolIntent = { type: "ask_clarifying_question", question: "which?" };
    expect(narrowToolIntent(ask, [])).toBe(ask);
  });
});

/**
 * `create_mission` is the capability the retired Goal Architect sheet used to own. It is
 * validated exactly like every other intent — closed shape, no partial salvage, and no
 * card id the workspace does not actually contain.
 */
describe("create_mission", () => {
  const mission = (overrides: Record<string, unknown> = {}) => ({
    message: "Here's a plan.",
    proposedActions: [
      {
        id: "p1",
        label: "Plan it",
        explanation: "Because you asked",
        tool: {
          type: "create_mission",
          title: "Ship a synth",
          goalStatement: "Build and ship a playable synth",
          targetDeliverable: "A demo anyone can play",
          successCriteria: ["It makes sound", "A stranger can use it"],
          steps: [
            { title: "Get audio out of a speaker", detail: "Any tone at all" },
            { title: "Add a keyboard", role: "task" },
          ],
          cardIds: ["c1"],
          ...overrides,
        },
      },
    ],
  });

  const toolFrom = (raw: unknown) =>
    normalizeWorkspaceAgentResponse(raw, VALID_IDS)?.proposedActions[0]?.tool;

  it("accepts a well-formed plan and keeps every field it was given", () => {
    expect(toolFrom(mission())).toEqual({
      type: "create_mission",
      title: "Ship a synth",
      goalStatement: "Build and ship a playable synth",
      targetDeliverable: "A demo anyone can play",
      successCriteria: ["It makes sound", "A stranger can use it"],
      steps: [
        { title: "Get audio out of a speaker", detail: "Any tone at all" },
        { title: "Add a keyboard", role: "task" },
      ],
      cardIds: ["c1"],
    });
  });

  it("rejects a plan with no title, no goal, or no steps rather than inventing one", () => {
    expect(toolFrom(mission({ title: "" }))).toBeUndefined();
    expect(toolFrom(mission({ goalStatement: "   " }))).toBeUndefined();
    expect(toolFrom(mission({ steps: [] }))).toBeUndefined();
    expect(toolFrom(mission({ steps: "two steps" }))).toBeUndefined();
  });

  it("rejects a malformed step instead of dropping it silently", () => {
    expect(toolFrom(mission({ steps: [{ title: "" }] }))).toBeUndefined();
    expect(toolFrom(mission({ steps: ["just a string"] }))).toBeUndefined();
    expect(toolFrom(mission({ steps: [{ title: "ok", role: "wizard" }] }))).toBeUndefined();
  });

  it("rejects card ids the workspace does not actually contain", () => {
    expect(toolFrom(mission({ cardIds: ["c1", "hallucinated"] }))).toBeUndefined();
  });

  it("offers every step and every source card as its own checkbox", () => {
    const tool = toolFrom(mission()) as AgentToolIntent;
    expect(toolIntentItems(tool)!.map(item => item.key)).toEqual(["step-0", "step-1", "c1"]);
  });

  it("narrows to the steps and cards left checked", () => {
    const tool = toolFrom(mission()) as AgentToolIntent;
    const narrowed = narrowToolIntent(tool, ["step-1"]) as Extract<
      AgentToolIntent,
      { type: "create_mission" }
    >;
    expect(narrowed.steps).toEqual([{ title: "Add a keyboard", role: "task" }]);
    expect(narrowed.cardIds).toBeUndefined();
  });

  it("refuses to dispatch a mission with every step unchecked", () => {
    const tool = toolFrom(mission()) as AgentToolIntent;
    expect(narrowToolIntent(tool, ["c1"])).toBeNull();
  });
});
