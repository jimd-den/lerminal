import { describe, expect, it } from "bun:test";
import {
  Conversation,
  ConversationMessage,
  conversationTitle,
  createConversation,
  isWorthSaving,
  sortByRecency,
  titleFromMessages,
  UNTITLED_CONVERSATION,
  withMessages,
} from "../conversation";

const userMessage = (text: string, createdAt = 1): ConversationMessage => ({
  id: `u-${createdAt}`,
  speaker: "user",
  text,
  createdAt,
});

const assistantMessage = (text: string, createdAt = 2): ConversationMessage => ({
  id: `a-${createdAt}`,
  speaker: "assistant",
  text,
  createdAt,
});

describe("conversationTitle", () => {
  it("uses the opening line as written when it is short enough", () => {
    expect(conversationTitle("Why does spacing beat massing?")).toBe(
      "Why does spacing beat massing?"
    );
  });

  it("takes only the first line of a multi-line message", () => {
    expect(conversationTitle("Compilers\n\nI want to understand them deeply")).toBe(
      "Compilers"
    );
  });

  it("cuts a long opening at a word boundary rather than mid-word", () => {
    const long =
      "I would like to develop a genuinely deep understanding of real-time rendering";
    const title = conversationTitle(long);

    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(61);
    // The cut landed between words, so the last word is intact.
    expect(long).toContain(title.replace("…", ""));
  });

  it("falls back to a placeholder for an empty message", () => {
    expect(conversationTitle("   ")).toBe(UNTITLED_CONVERSATION);
  });
});

describe("titleFromMessages", () => {
  it("names a conversation after the first user message, not the latest", () => {
    const messages = [
      userMessage("How does FSRS schedule reviews?", 1),
      assistantMessage("It models memory stability.", 2),
      userMessage("What about leeches?", 3),
    ];

    // The opening question is what the learner recognises the conversation by; a title
    // that changed every turn would make the history list unscannable.
    expect(titleFromMessages(messages)).toBe("How does FSRS schedule reviews?");
  });

  it("ignores an assistant-only transcript", () => {
    expect(titleFromMessages([assistantMessage("Hello.")])).toBe(UNTITLED_CONVERSATION);
  });
});

describe("isWorthSaving", () => {
  it("refuses a conversation the user never spoke in", () => {
    const opened = createConversation({ workspaceId: "w1" });
    const assistantOnly = createConversation({
      workspaceId: "w1",
      messages: [assistantMessage("Unprompted.")],
    });

    expect(isWorthSaving(opened)).toBe(false);
    expect(isWorthSaving(assistantOnly)).toBe(false);
  });

  it("accepts one with a real user message", () => {
    const real = createConversation({
      workspaceId: "w1",
      messages: [userMessage("Explain interleaving")],
    });

    expect(isWorthSaving(real)).toBe(true);
  });

  it("treats a whitespace-only user message as nothing said", () => {
    const blank = createConversation({
      workspaceId: "w1",
      messages: [userMessage("   ")],
    });

    expect(isWorthSaving(blank)).toBe(false);
  });
});

describe("withMessages", () => {
  it("names a still-untitled conversation once the user finally speaks", () => {
    const empty = createConversation({ workspaceId: "w1", now: 100 });
    expect(empty.title).toBe(UNTITLED_CONVERSATION);

    const updated = withMessages(empty, [userMessage("What is a monad?")], {}, 200);

    expect(updated.title).toBe("What is a monad?");
    expect(updated.updatedAt).toBe(200);
  });

  it("keeps an established title even as the transcript grows", () => {
    const started = createConversation({
      workspaceId: "w1",
      messages: [userMessage("First question", 1)],
      now: 100,
    });

    const grown = withMessages(
      started,
      [userMessage("First question", 1), userMessage("A totally different one", 3)],
      {},
      300
    );

    expect(grown.title).toBe("First question");
  });

  it("carries settled tag outcomes through", () => {
    const started = createConversation({ workspaceId: "w1" });

    const updated = withMessages(
      started,
      [userMessage("hi")],
      { "m1:tag-0": { status: "done", resultMessage: "Created 1 card." } }
    );

    expect(updated.tagActions["m1:tag-0"]).toEqual({
      status: "done",
      resultMessage: "Created 1 card.",
    });
  });
});

describe("sortByRecency", () => {
  it("puts the most recently touched conversation first, without mutating the input", () => {
    const older: Conversation = createConversation({ workspaceId: "w1", now: 100 });
    const newer: Conversation = createConversation({ workspaceId: "w1", now: 500 });
    const input = [older, newer];

    expect(sortByRecency(input).map(c => c.updatedAt)).toEqual([500, 100]);
    expect(input.map(c => c.updatedAt)).toEqual([100, 500]);
  });
});
