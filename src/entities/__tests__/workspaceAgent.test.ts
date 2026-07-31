import { describe, expect, it } from "bun:test";
import { normalizeWorkspaceAgentResponse } from "../workspaceAgent";

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

  it("rejects an unknown tool type", () => {
    const result = normalizeWorkspaceAgentResponse(
      {
        message: "hi",
        proposedActions: [
          {
            id: "p1",
            label: "Do something",
            explanation: "because",
            tool: { type: "delete_workspace" },
          },
        ],
      },
      VALID_IDS
    );
    expect(result).toBeNull();
  });

  it("rejects a tool referencing a card id that isn't in validCardIds", () => {
    const result = normalizeWorkspaceAgentResponse(
      {
        message: "hi",
        proposedActions: [
          {
            id: "p1",
            label: "Extract",
            explanation: "has a link",
            tool: { type: "extract_url", cardId: "does-not-exist" },
          },
        ],
      },
      VALID_IDS
    );
    expect(result).toBeNull();
  });

  it("rejects create_cards with a malformed card (bad type, missing title/body)", () => {
    const badType = normalizeWorkspaceAgentResponse(
      {
        message: "hi",
        proposedActions: [
          {
            id: "p1",
            label: "Create",
            explanation: "worth capturing",
            tool: { type: "create_cards", cards: [{ type: "not-a-real-type", title: "T", body: "B" }] },
          },
        ],
      },
      VALID_IDS
    );
    expect(badType).toBeNull();

    const missingBody = normalizeWorkspaceAgentResponse(
      {
        message: "hi",
        proposedActions: [
          {
            id: "p1",
            label: "Create",
            explanation: "worth capturing",
            tool: { type: "create_cards", cards: [{ type: "note", title: "T" }] },
          },
        ],
      },
      VALID_IDS
    );
    expect(missingBody).toBeNull();
  });

  it("rejects create_group / chunk_cards / make_study_candidates referencing missing card ids", () => {
    expect(
      normalizeWorkspaceAgentResponse(
        {
          message: "hi",
          proposedActions: [
            {
              id: "p1",
              label: "Group",
              explanation: "related",
              tool: { type: "create_group", name: "New group", cardIds: ["c1", "missing"] },
            },
          ],
        },
        VALID_IDS
      )
    ).toBeNull();

    expect(
      normalizeWorkspaceAgentResponse(
        {
          message: "hi",
          proposedActions: [
            {
              id: "p1",
              label: "Chunk",
              explanation: "long source",
              tool: { type: "chunk_cards", cardIds: ["missing"], mode: "deterministic" },
            },
          ],
        },
        VALID_IDS
      )
    ).toBeNull();

    expect(
      normalizeWorkspaceAgentResponse(
        {
          message: "hi",
          proposedActions: [
            {
              id: "p1",
              label: "Study",
              explanation: "ready to review",
              tool: { type: "make_study_candidates", cardIds: ["missing"], mode: "recall" },
            },
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

  it("rejects the whole turn when one of several proposals is malformed", () => {
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
    expect(normalizeWorkspaceAgentResponse(raw, VALID_IDS)).toBeNull();
  });
});
