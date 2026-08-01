import { describe, expect, it } from "bun:test";
import { AgentToolIntent, narrowToolIntent, toolIntentItems } from "../workspaceAgent";

/**
 * The JSON-envelope validator these tests used to cover is gone: the model no longer
 * produces a turn object, it writes prose with tags and `entities/agentTags` builds the
 * intents. What survives here is the per-item selection layer, which the tag path still
 * uses — a `[[group: …]]` naming several cards is still pruned before it dispatches.
 */
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
describe("create_mission — per-item selection", () => {
  const mission = (): AgentToolIntent => ({
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

  // The field-level validation these tests used to do (empty title, malformed step,
  // hallucinated card id) now happens where the intent is actually built, in
  // `entities/agentTags` — an intent cannot reach this module malformed any more.

  it("offers every step and every source card as its own checkbox", () => {
    expect(toolIntentItems(mission())!.map(item => item.key)).toEqual(["step-0", "step-1", "c1"]);
  });

  it("narrows to the steps and cards left checked", () => {
    const narrowed = narrowToolIntent(mission(), ["step-1"]) as Extract<
      AgentToolIntent,
      { type: "create_mission" }
    >;
    expect(narrowed.steps).toEqual([{ title: "Add a keyboard", role: "task" }]);
    expect(narrowed.cardIds).toBeUndefined();
  });

  it("refuses to dispatch a mission with every step unchecked", () => {
    expect(narrowToolIntent(mission(), ["c1"])).toBeNull();
  });
});
