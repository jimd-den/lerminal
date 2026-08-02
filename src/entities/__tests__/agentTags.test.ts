import { describe, expect, it } from "bun:test";
import { agentTagIntents, parseAgentTags } from "../agentTags";

/**
 * The parser is the whole trust boundary now, and its real user is a 2B–4B local model
 * that will get the syntax slightly wrong most of the time. These tests are therefore
 * mostly about *forgiveness*: every plausible mangling of a tag must land on the same
 * intent, and nothing the model wrote may ever be lost or shown as bracket noise.
 */
describe("parseAgentTags", () => {
  it("returns plain prose and zero tags for an ordinary reply", () => {
    const parsed = parseAgentTags("Spacing beats massing because retrieval gets harder.");

    expect(parsed.text).toBe("Spacing beats massing because retrieval gets harder.");
    expect(parsed.tags).toEqual([]);
    expect(agentTagIntents(parsed)).toEqual([]);
    expect(parsed.segments).toHaveLength(1);
  });

  it("turns a note tag into a create_cards intent", () => {
    const parsed = parseAgentTags("Reviews get harder over time. [[note: Spaced repetition]]");

    expect(parsed.tags).toHaveLength(1);
    const tag = parsed.tags[0];
    expect(tag.type).toBe("note");
    expect(tag.kindLabel).toBe("NOTE");
    expect(tag.title).toBe("Spaced repetition");
    expect(tag.intent).toEqual({
      type: "create_cards",
      cards: [
        {
          type: "note",
          title: "Spaced repetition",
          body: "Reviews get harder over time.",
        },
      ],
    });
  });

  it("takes the body from the surrounding prose rather than from the tag", () => {
    const parsed = parseAgentTags("A cue that fails is still informative. [[note: Failed cues]]");
    const intent = parsed.tags[0].intent as any;

    expect(intent.cards[0].body).toBe("A cue that fails is still informative.");
  });

  it("falls back to following prose, then to the title, for a body", () => {
    const after = parseAgentTags("[[note: Interference]] Competing traces blunt recall.");
    expect((after.tags[0].intent as any).cards[0].body).toBe("Competing traces blunt recall.");

    const alone = parseAgentTags("[[note: Interference]]");
    expect((alone.tags[0].intent as any).cards[0].body).toBe("Interference");
  });

  it("never starts a note body mid-sentence when the preceding paragraph is long", () => {
    // A note is only "usable" study material if it reads as a complete thought. Naive
    // character-truncation of a long lead-in paragraph can slice into the middle of a
    // sentence (or word), handing the reviewer a fragment to puzzle over later.
    const longLeadIn =
      "Cognitive load theory holds that working memory can juggle only a handful of " +
      "elements at once, so material that packs too many interacting ideas into a single " +
      "explanation overwhelms a learner before they can encode any of it. Effective " +
      "teaching therefore sequences complexity deliberately, introducing one new element " +
      "at a time and letting each become automatic before the next is layered on top, " +
      "which is the same reasoning behind interleaving practice across related skills " +
      "rather than mastering one in isolation before touching the next.";
    const parsed = parseAgentTags(`${longLeadIn} [[note: Cognitive load]]`);
    const body = (parsed.tags[0].intent as any).cards[0].body as string;

    // A real sentence starts with a capital letter (or a quote/number), never with a
    // lowercase continuation of the word or clause it was sliced out of.
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toBe(body[0].toUpperCase());
    expect(longLeadIn).toContain(body.trimEnd().replace(/\.$/, ""));
  });

  it("returns one oversized sentence whole rather than fragmenting it", () => {
    const oneGiantSentence =
      "This single sentence about the testing effect keeps going and going with clause " +
      "after clause about how retrieval practice strengthens memory traces more than " +
      "additional rereading ever could, deliberately written well past four hundred " +
      "characters in total length so that no reasonable per-body budget could possibly " +
      "hold the whole thing without cutting straight through the middle of a clause, " +
      "which is exactly the fragment this test exists to rule out entirely.";
    expect(oneGiantSentence.length).toBeGreaterThan(400);

    const parsed = parseAgentTags(`${oneGiantSentence} [[note: Testing effect]]`);
    const body = (parsed.tags[0].intent as any).cards[0].body as string;

    expect(body).toBe(oneGiantSentence);
  });

  it("keeps a forward (following-prose) body from cutting mid-sentence too", () => {
    const longFollowUp =
      "This idea keeps expanding across several clauses about how interleaving different " +
      "problem types forces the learner to first identify which strategy applies before " +
      "executing it, which is precisely the discrimination skill that blocked practice " +
      "never trains, and that is exactly why the effect shows up so reliably in the " +
      "literature on mathematics and category learning alike.";
    const parsed = parseAgentTags(`[[note: Interleaving]] ${longFollowUp}`);
    const body = (parsed.tags[0].intent as any).cards[0].body as string;

    expect(body.length).toBeGreaterThan(0);
    expect(/[.!?]["')\]]*$/.test(body)).toBe(true);
    expect(longFollowUp).toContain(body);
  });

  it("turns a question tag into a question card", () => {
    const parsed = parseAgentTags("[[question: Why does spacing beat massing?]]");
    const intent = parsed.tags[0].intent as any;

    expect(parsed.tags[0].type).toBe("question");
    expect(intent.cards[0].type).toBe("question");
    expect(intent.cards[0].title).toBe("Why does spacing beat massing?");
  });

  it("turns a link tag into a source card carrying the URL", () => {
    const parsed = parseAgentTags("Worth reading. [[link: https://example.com/paper]]");
    const intent = parsed.tags[0].intent as any;

    expect(intent.cards[0].type).toBe("source");
    expect(intent.cards[0].body).toBe("https://example.com/paper");
  });

  it("accepts an optional label after a link URL", () => {
    const parsed = parseAgentTags("[[link: https://example.com/p|The original paper]]");

    expect(parsed.tags[0].title).toBe("The original paper");
    expect((parsed.tags[0].intent as any).cards[0].body).toBe("https://example.com/p");
  });

  it("refuses a link that isn't a usable web address, without losing it", () => {
    const parsed = parseAgentTags("[[link: see my notes]]");

    expect(parsed.tags[0].intent).toBeNull();
    expect(parsed.tags[0].invalidReason).toContain("web address");
    expect(parsed.text).toContain("see my notes");
  });

  it("groups the cards the app has in context when the model names none", () => {
    const parsed = parseAgentTags("[[group: Memory research]]", {
      cards: [
        { id: "c1", title: "Spacing effect" },
        { id: "c2", title: "Interference" },
      ],
      contextCardIds: ["c1", "c2"],
    });

    expect(parsed.tags[0].intent).toEqual({
      type: "create_group",
      name: "Memory research",
      cardIds: ["c1", "c2"],
    });
  });

  it("says so honestly when a group has no cards to put in it", () => {
    const parsed = parseAgentTags("[[group: Memory research]]");

    expect(parsed.tags[0].intent).toBeNull();
    expect(parsed.tags[0].invalidReason).toContain("no cards in context");
  });

  it("produces no intent for a reference that resolves to no real card", () => {
    const parsed = parseAgentTags("[[group: Fakes|the dragon paper]]", {
      cards: [{ id: "c1", title: "Spacing effect" }],
      contextCardIds: ["c1"],
    });

    expect(parsed.tags[0].intent).toBeNull();
    expect(parsed.tags[0].invalidReason).toContain("the dragon paper");
    expect(agentTagIntents(parsed)).toEqual([]);
  });

  describe("referring to cards the way a person would", () => {
    const cards = [
      { id: "c1", title: "Frame budget on mobile" },
      { id: "c2", title: "Spacing effect" },
      { id: "c3", title: "Interference" },
      { id: "c4", title: "Cue overload" },
    ];

    it("resolves briefing numbers to real card ids", () => {
      const parsed = parseAgentTags("[[group: Memory research|1, 3, 4]]", { cards });

      expect(parsed.tags[0].intent).toEqual({
        type: "create_group",
        name: "Memory research",
        cardIds: ["c1", "c3", "c4"],
      });
    });

    it("resolves titles, case-insensitively and loosely", () => {
      const parsed = parseAgentTags("[[group: Memory research|spacing effect, Interference]]", {
        cards,
      });

      expect((parsed.tags[0].intent as any).cardIds).toEqual(["c2", "c3"]);
    });

    it("names the group itself when the model gives only numbers", () => {
      const parsed = parseAgentTags("[[group: 2, 3]]", { cards });

      expect(parsed.tags[0].intent).toEqual({
        type: "create_group",
        name: "New group",
        cardIds: ["c2", "c3"],
      });
    });

    it("never guesses between two candidate cards", () => {
      const parsed = parseAgentTags("[[group: Mine|effect]]", {
        cards: [
          { id: "a", title: "Spacing effect" },
          { id: "b", title: "Testing effect" },
        ],
      });

      expect(parsed.tags[0].intent).toBeNull();
    });

    it("never resolves anything when no cards were given", () => {
      const parsed = parseAgentTags("[[group: Mine|1, 2]]");

      expect(parsed.tags[0].intent).toBeNull();
      expect(agentTagIntents(parsed)).toEqual([]);
    });
  });

  describe("forgiveness — every one of these means the same thing", () => {
    const variants = [
      "[[note: Spaced repetition]]",
      "[[NOTE: Spaced repetition]]",
      "[[Note: Spaced repetition]]",
      "[[ note : Spaced repetition ]]",
      "[note: Spaced repetition]",
      "[[note - Spaced repetition]]",
      "[[note — Spaced repetition]]",
      "[[note Spaced repetition]]",
      "[[note: Spaced repetition.]]",
      "[[note:Spaced repetition]]",
      "[[note: Spaced repetition",
      "[[note: Spaced repetition]",
    ];

    for (const variant of variants) {
      it(`reads ${JSON.stringify(variant)} as a note about spaced repetition`, () => {
        const parsed = parseAgentTags(variant);

        expect(parsed.tags).toHaveLength(1);
        expect(parsed.tags[0].type).toBe("note");
        expect(parsed.tags[0].title).toBe("Spaced repetition");
        expect(parsed.tags[0].intent).not.toBeNull();
      });
    }
  });

  describe("streaming", () => {
    const full = "Here is the idea. [[note: Spaced repetition]] That's the core of it.";

    it("never shows a half-written tag as brackets or as a chip", () => {
      for (let length = 1; length <= full.length; length += 1) {
        const prefix = full.slice(0, length);
        const parsed = parseAgentTags(prefix, { streaming: true });

        expect(parsed.text).not.toContain("[[");
        // A chip only ever exists complete: never a truncated title, never a broken tag.
        for (const tag of parsed.tags) {
          expect(tag.title).toBe("Spaced repetition");
        }
      }
    });

    it("becomes a real chip on the token that closes the tag", () => {
      const justBefore = parseAgentTags("Here is the idea. [[note: Spaced repetitio", {
        streaming: true,
      });
      expect(justBefore.tags).toHaveLength(0);
      expect(justBefore.text).toBe("Here is the idea. ");

      const closed = parseAgentTags("Here is the idea. [[note: Spaced repetition]]", {
        streaming: true,
      });
      expect(closed.tags).toHaveLength(1);
      expect(closed.tags[0].title).toBe("Spaced repetition");
    });

    it("keeps tag ids stable as more text arrives", () => {
      const a = parseAgentTags("[[note: One]] and", { streaming: true });
      const b = parseAgentTags("[[note: One]] and [[note: Two]]", { streaming: true });

      expect(a.tags[0].id).toBe("tag-0");
      expect(b.tags[0].id).toBe("tag-0");
      expect(b.tags[1].id).toBe("tag-1");
    });
  });

  describe("degradation", () => {
    it("renders an unknown tag type as readable prose, never as brackets", () => {
      const parsed = parseAgentTags("Try [[summon: a dragon]] next.");

      expect(parsed.tags).toEqual([]);
      expect(parsed.text).toBe("Try [[summon: a dragon]] next.");
      expect(parsed.text).toContain("a dragon");
    });

    it("keeps the words of a malformed tag rather than discarding them", () => {
      const parsed = parseAgentTags("[[note: ]] still counts");

      expect(parsed.tags).toEqual([]);
      expect(parsed.text).toContain("still counts");
    });

    it("never costs the user the message when a tag is malformed", () => {
      const parsed = parseAgentTags("The answer is 42. [[link: not-a-url]] Hope that helps.");

      expect(parsed.text).toContain("The answer is 42.");
      expect(parsed.text).toContain("Hope that helps.");
    });

    it("leaves ordinary brackets and markdown links alone", () => {
      const parsed = parseAgentTags("See [the paper](https://example.com) and [1].");

      expect(parsed.tags).toEqual([]);
      expect(parsed.text).toBe("See [the paper](https://example.com) and [1].");
    });

    it("does not treat a word merely starting with a tag name as a tag", () => {
      const parsed = parseAgentTags("[notebook: mine]");

      expect(parsed.tags).toEqual([]);
      expect(parsed.text).toBe("[notebook: mine]");
    });
  });

  it("renders an escaped double bracket as a literal one", () => {
    const parsed = parseAgentTags("Write \\[[note: X]] to make a note.");

    expect(parsed.tags).toEqual([]);
    expect(parsed.text).toContain("[[note: X]]");
  });

  it("finds several tags and keeps the prose between them", () => {
    const parsed = parseAgentTags(
      "First idea. [[note: One]] Then a source. [[link: https://example.com]] Done."
    );

    expect(parsed.tags.map(tag => tag.type)).toEqual(["note", "link"]);
    expect(parsed.text).toContain("First idea.");
    expect(parsed.text).toContain("Done.");
    expect(agentTagIntents(parsed)).toHaveLength(2);
  });
});
