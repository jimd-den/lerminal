import { AgentToolIntent } from "./workspaceAgent";

/**
 * # Agent Tags — the model writes prose, the app builds the structure
 *
 * ## Business Value & Purpose
 * The Workspace Agent used to be asked for a JSON envelope. That put the model in charge
 * of a data structure it is bad at, and the failure mode was the worst one available: a
 * whole turn rejected over a bracket, or a plausible-looking object full of invented ids.
 * The target model here is not GPT-4-class — it is a 2B–4B local model, and the product's
 * destination is offline. A model that small cannot be trusted to emit JSON, choose among
 * a dozen action types, or keep four pipe-separated fields straight.
 *
 * So the division of labour is: **the model writes a sentence and drops a marker in it;
 * the app builds everything else.** Structure is our job, not the model's.
 *
 * ## The grammar — five tags, a title and an optional detail
 *
 * ```
 * [[note: Spaced repetition | Revisiting material at growing intervals beats massing it.]]
 * [[question: Why does spacing beat massing? | Each delayed recall is harder, and the
 *   difficulty is what consolidates the memory.]]
 * [[link: https://example.com/paper]]
 * [[group: Memory research]]
 * [[syllabus: Master WebGPU]]
 * ```
 *
 * That is the entire surface the model has to learn. There is deliberately no tag for
 * chunking, extraction, study candidates or card-to-card links: those intents still exist
 * and still dispatch unchanged, but they are reached by the user through the app's own
 * affordances, not by asking a small model to pick the right word out of a dozen. Fewer,
 * more obvious names beat complete coverage. `syllabus` is the one exception: turning a
 * casually-stated mastery goal straight into a phased syllabus is worth a tag on a model
 * capable enough to recognize the intent, since it saves a trip through Mission Control —
 * see `entities/workspaceAgent`'s `generate_syllabus` intent for what it dispatches to.
 *
 * **A note's detail comes from the tag first, the prose second.** `[[note: Title | detail]]`
 * is the shape the contract asks for, because a card is read weeks later with none of the
 * conversation around it, and a title alone teaches nothing. When the model omits the
 * detail — it often does when listing several tags in a row — the body falls back to the
 * prose the tag was written in, which is usually the sentence that explains it.
 *
 * That fallback is deliberately picky: a bare lead-in like "Here are some cards:" is not a
 * description, so prose that only introduces the tags is refused rather than saved as the
 * body of the first one. When nothing usable is found the body is left empty, because an
 * empty body is honestly blank while a body echoing the title looks filled in and isn't.
 *
 * **The model never handles card ids.** Copying an opaque id like `c1a2b3d4` is the single
 * hardest thing we could ask a 2B model to do, and it will mangle or invent one. So it
 * doesn't have to: a bare `[[group: Name]]` groups the cards the user actually has in
 * context, and when the model does want to be specific it refers to cards the way a person
 * would — by the number the briefing gave them, or by title:
 *
 * ```
 * [[group: Memory research]]            the cards in context right now
 * [[group: Memory research|1, 3, 4]]    the 1st, 3rd and 4th card in the briefing
 * [[group: Memory research|Spacing effect]]   by title
 * ```
 *
 * The **app** resolves those back to real ids. A reference that resolves to nothing yields
 * no intent at all — the same trust boundary as before, minus the impossible ask.
 *
 * ## Parsing is forgiving on purpose
 * Assume the model gets it slightly wrong most of the time. All of these mean the same
 * thing and produce the same intent:
 *
 * ```
 * [[note: Title]]   [[NOTE: Title]]   [[ note : Title ]]   [note: Title]
 * [[note - Title]]  [[note Title]]    [[note: Title.]]     [[note: Title      (end of reply)
 * ```
 *
 * ## Nothing is ever lost, and no brackets are ever shown
 * An unknown type or an unusable argument degrades to **readable prose**: the brackets are
 * dropped and the content is kept. A malformed tag must never cost the user the message.
 * Zero tags is a completely normal, complete turn — most turns from a small model will
 * have none, and the reply stands on its own.
 *
 * ## Streaming tolerance
 * {@link parseAgentTags} is pure and re-runs on every token over a longer prefix. With
 * `{ streaming: true }` a trailing unterminated `[[…` is held back entirely — never a
 * half-written chip, never bracket noise — and becomes a real chip on the token that
 * closes it. The final parse (streaming off) accepts an unterminated tag at the very end,
 * because a small model dropping the closing brackets is a typo, not a refusal.
 *
 * ## Parsing is not trusting
 * The trust boundary the JSON validator held lives here. A tag naming a card id that isn't
 * in `validCardIds` yields `intent: null` and a truthful `invalidReason`: visible, because
 * the model did write it, but not actionable, and it never reaches the dispatcher. Pure:
 * no I/O, no React, no network.
 */

import { CardType } from "./card";

/** Every tag type the grammar accepts. Anything else degrades to prose. */
export type AgentTagType = "note" | "question" | "link" | "group" | "syllabus" | "cards";

/**
 * One tag found in a reply.
 *
 * `intent` is `null` exactly when the tag could not be trusted or completed — an unknown
 * card id, a group with nothing to put in it, a link that isn't a URL. The chip still
 * renders (the model did write it), but there is nothing to add, and `invalidReason` says
 * why in the user's own terms.
 */
export interface ParsedAgentTag {
  /** Stable for a given prefix of the same text: `tag-0`, `tag-1`, … in source order. */
  id: string;
  type: AgentTagType;
  /** Short label for the chip: NOTE, QUESTION, LINK, GROUP. */
  kindLabel: string;
  /** The human title shown on the chip. Never empty. */
  title: string;
  /** The dispatchable intent, or `null` when the tag isn't actionable. */
  intent: AgentToolIntent | null;
  /** Truthful reason the tag isn't actionable. Set if and only if `intent` is null. */
  invalidReason?: string;
}

/** Prose, or a tag, in the order the model wrote them. */
export type AgentMessageSegment =
  | { kind: "text"; text: string }
  | { kind: "tag"; tag: ParsedAgentTag };

export interface ParsedAgentMessage {
  /** The reply as plain readable text: prose, with each tag rendered as its title. */
  text: string;
  /** Prose and tags interleaved, so the UI can place chips where they really are. */
  segments: AgentMessageSegment[];
  /** Every tag found, in source order (including ones that aren't actionable). */
  tags: ParsedAgentTag[];
}

/** A real card, as the briefing listed it. Position in the array is its briefing number. */
export interface AgentTagCardRef {
  id: string;
  title: string;
}

export interface ParseAgentTagsOptions {
  /**
   * The cards exactly as the briefing numbered them, in order. This is the only way a
   * reference in a tag becomes a real card id — the model names a number or a title, and
   * the app does the resolving. Omitted means nothing is resolvable, the safe direction.
   */
  cards?: AgentTagCardRef[];
  /**
   * The cards the user actually has in context right now. This is what a bare
   * `[[group: Name]]` groups — the app supplying the structure the model shouldn't have
   * to invent.
   */
  contextCardIds?: Iterable<string>;
  /**
   * True while tokens are still arriving. Holds back a trailing unterminated tag so a
   * half-written one is never shown as bracket noise or as a broken chip.
   */
  streaming?: boolean;
}

const KIND_LABELS: Record<AgentTagType, string> = {
  note: "NOTE",
  question: "QUESTION",
  link: "LINK",
  group: "GROUP",
  syllabus: "SYLLABUS",
  cards: "SET",
};

const TAG_TYPES = Object.keys(KIND_LABELS) as AgentTagType[];

/** Placeholder used while scanning, so an escaped `\[[` survives as literal text. */
const ESCAPE_TOKEN = " GRIOT_LB ";

const unescape = (text: string): string => text.split(ESCAPE_TOKEN).join("[[");

/** Leading `:`/`-`/`—`/whitespace between the type word and its argument. All optional. */
const SEPARATOR = /^[\s:：\-–—=,]*/;
/**
 * Sentence punctuation a model habitually leaves inside the brackets. `?` and `!` are
 * deliberately not in the set — they carry meaning in a question's title.
 */
const TRAILING_JUNK = /[\s.,;:]+$/;

/**
 * Splits a raw reply into prose and tags, validating every tag it finds.
 *
 * Pure and total: any input produces a message. Never throws, never drops the model's
 * words, never emits a tag it could not fully understand.
 */
export function parseAgentTags(
  raw: string,
  options: ParseAgentTagsOptions = {}
): ParsedAgentMessage {
  const cards = options.cards ?? [];
  const validCardIds = new Set(cards.map(card => card.id));
  const contextCardIds = [...(options.contextCardIds ?? [])].filter(id => validCardIds.has(id));
  const streaming = options.streaming === true;
  const source = (raw ?? "").split("\\[[").join(ESCAPE_TOKEN).split("\\[").join(ESCAPE_TOKEN);

  const segments: AgentMessageSegment[] = [];
  let pendingText = "";

  const flushText = () => {
    if (!pendingText) return;
    segments.push({ kind: "text", text: unescape(pendingText) });
    pendingText = "";
  };

  let cursor = 0;
  let tagIndex = 0;

  while (cursor < source.length) {
    const open = source.indexOf("[", cursor);
    if (open === -1) {
      pendingText += source.slice(cursor);
      break;
    }

    pendingText += source.slice(cursor, open);

    // One or two opening brackets are both accepted — a small model drops one often.
    let afterOpen = open;
    while (afterOpen < source.length && source[afterOpen] === "[") afterOpen += 1;

    const match = matchTagType(source, afterOpen);
    if (!match) {
      // Mid-stream, `[[n` is not prose — it is a tag that has only just begun. Hold it
      // back so the reader never sees a bracket that is about to become a chip.
      if (streaming && source.indexOf("]", open) === -1 && isTagPrefix(source.slice(afterOpen))) {
        break;
      }
      // An ordinary bracket in prose (including a markdown link). Left exactly as written.
      pendingText += source.slice(open, afterOpen);
      cursor = afterOpen;
      continue;
    }

    let end = source.indexOf("]", match.end);
    let contentEnd: number;
    let nextCursor: number;

    if (end === -1) {
      // Unterminated. Mid-stream the tag simply hasn't finished arriving, so hold it back
      // rather than flashing `[[note: Fra` at the reader. At the end of a completed reply
      // it is a dropped bracket, which we forgive.
      if (streaming) break;
      contentEnd = source.length;
      nextCursor = source.length;
    } else {
      contentEnd = end;
      let afterClose = end;
      while (afterClose < source.length && source[afterClose] === "]") afterClose += 1;
      nextCursor = afterClose;
    }

    // Trailing junk is stripped per-part in `buildTag`, not here: it belongs on a title
    // ("[[note: Title.]]"), but a detail is a real sentence and must keep its full stop.
    const rawArgs = source.slice(match.end, contentEnd).replace(SEPARATOR, "");
    cursor = nextCursor;

    const tag = buildTag(match.type, unescape(rawArgs), tagIndex, cards, contextCardIds);
    if (!tag) {
      // Unusable: the reader still sees every word the model wrote, minus the brackets.
      pendingText += `${match.type} ${unescape(rawArgs)}`.trim();
      continue;
    }

    flushText();
    segments.push({ kind: "tag", tag });
    tagIndex += 1;
  }

  flushText();

  resolveBodiesFromProse(segments);

  const text = segments
    .map(segment => (segment.kind === "text" ? segment.text : segment.tag.title))
    .join("");

  return {
    text,
    segments,
    tags: segments
      .filter((segment): segment is { kind: "tag"; tag: ParsedAgentTag } => segment.kind === "tag")
      .map(segment => segment.tag),
  };
}

/** Convenience: every actionable intent in a reply, in source order. */
export function agentTagIntents(parsed: ParsedAgentMessage): AgentToolIntent[] {
  return parsed.tags
    .map(tag => tag.intent)
    .filter((intent): intent is AgentToolIntent => intent !== null);
}

/**
 * Whether a tag word starts at `index` — case-insensitively, and only when it is a whole
 * word, so `[notebook]` is prose and `[note: x]` is a tag.
 */
function matchTagType(
  source: string,
  index: number
): { type: AgentTagType; end: number } | null {
  // Leading whitespace inside the brackets — `[[ note : X ]]` — is a typo, not a refusal.
  let start = index;
  while (start < source.length && /\s/.test(source[start])) start += 1;

  const rest = source.slice(start, start + 20).toLowerCase();
  for (const type of TAG_TYPES) {
    if (!rest.startsWith(type)) continue;
    const next = source[start + type.length];
    if (next === undefined || !/[A-Za-z0-9_]/.test(next)) {
      return { type, end: start + type.length };
    }
  }
  return null;
}

/** Whether a partial run of text could still grow into a tag name. Streaming only. */
function isTagPrefix(text: string): boolean {
  const candidate = text.trimStart().toLowerCase();
  return TAG_TYPES.some(type => type.startsWith(candidate));
}

/**
 * Fills in a note/question's body from the prose it was written in, when the tag itself
 * carried no detail.
 *
 * The nearest preceding prose wins, then the nearest following prose. What it will *not*
 * do is invent a body out of something that isn't one: a lead-in ("Here are some cards:")
 * introduces the tags rather than describing any of them, and the title repeated back is
 * a card that looks filled in and teaches nothing. Both are refused, leaving the body
 * empty — which the UI can show as the blank it really is.
 */
function resolveBodiesFromProse(segments: AgentMessageSegment[]): void {
  const nearestProse = (index: number): string => {
    for (let i = index - 1; i >= 0; i -= 1) {
      const segment = segments[i];
      if (segment.kind !== "text") break;
      const text = lastSentences(segment.text);
      if (text && isDescriptive(text)) return text;
    }
    for (let i = index + 1; i < segments.length; i += 1) {
      const segment = segments[i];
      if (segment.kind !== "text") break;
      const text = firstSentences(segment.text);
      if (text && isDescriptive(text)) return text;
    }
    return "";
  };

  segments.forEach((segment, index) => {
    if (segment.kind !== "tag") return;
    const intent = segment.tag.intent;
    if (!intent || intent.type !== "create_cards") return;
    const card = intent.cards[0];
    if (card.body) return;
    card.body = nearestProse(index);
  });
}

/**
 * Whether a run of prose actually describes something, as opposed to merely announcing
 * what follows. "Here are some cards:" is the model clearing its throat — saving it as a
 * note's body is worse than saving nothing, because it reads as a real description.
 */
function isDescriptive(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Ends in a colon and is short: a lead-in, not a description.
  if (/:$/.test(trimmed) && trimmed.length < 120) return false;
  return true;
}

const SENTENCE_LIMIT = 400;

/**
 * Splits a paragraph into whole sentences (terminator kept, trailing space dropped). The
 * last "sentence" may have no terminator at all — the model's stream can simply stop.
 */
function splitSentences(paragraph: string): string[] {
  const matches = paragraph.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g);
  return (matches ?? []).map(s => s.trim()).filter(Boolean);
}

/**
 * The last sentence or two of a prose run — enough context to be a body, never the essay,
 * and never a fragment. A note is only usable study material if it reads as a complete
 * thought, so this accumulates *whole* sentences from the end up to the budget rather
 * than character-slicing, which can (and did) cut into the middle of a sentence or word.
 * A single sentence longer than the budget is still returned whole — a long body beats an
 * unreadable fragment.
 */
function lastSentences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const paragraph = trimmed.split(/\n{2,}/).pop()?.trim() ?? "";
  const sentences = splitSentences(paragraph);
  if (sentences.length === 0) return "";

  const picked: string[] = [sentences[sentences.length - 1]];
  let length = picked[0].length;
  for (let i = sentences.length - 2; i >= 0; i -= 1) {
    const next = sentences[i];
    if (length + 1 + next.length > SENTENCE_LIMIT) break;
    picked.unshift(next);
    length += 1 + next.length;
  }
  return picked.join(" ").trim();
}

/** The forward counterpart of {@link lastSentences} — same whole-sentence discipline. */
function firstSentences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const paragraph = trimmed.split(/\n{2,}/)[0].trim();
  const sentences = splitSentences(paragraph);
  if (sentences.length === 0) return "";

  const picked: string[] = [sentences[0]];
  let length = picked[0].length;
  for (let i = 1; i < sentences.length; i += 1) {
    const next = sentences[i];
    if (length + 1 + next.length > SENTENCE_LIMIT) break;
    picked.push(next);
    length += 1 + next.length;
  }
  return picked.join(" ").trim();
}

function buildTag(
  type: AgentTagType,
  args: string,
  index: number,
  cards: AgentTagCardRef[],
  contextCardIds: string[]
): ParsedAgentTag | null {
  const parts = args
    .split("|")
    .map(part => part.trim())
    .filter(part => part.length > 0);
  // The title loses sentence punctuation the model habitually leaves inside the brackets;
  // the detail after `|` keeps its own, because it is prose meant to be read as written.
  const title = (parts[0] ?? "").replace(TRAILING_JUNK, "");
  if (!title) return null;
  const detail = parts.slice(1).join(" ").trim();

  const id = `tag-${index}`;
  const kindLabel = KIND_LABELS[type];
  const make = (
    chipTitle: string,
    intent: AgentToolIntent | null,
    invalidReason?: string
  ): ParsedAgentTag => ({
    id,
    type,
    kindLabel,
    title: chipTitle,
    intent,
    ...(intent ? {} : { invalidReason: invalidReason ?? "This isn't something I can add." }),
  });

  /** One card, body deliberately left blank — {@link resolveBodiesFromProse} fills it. */
  const card = (cardType: CardType, cardTitle: string, body: string): AgentToolIntent => ({
    type: "create_cards",
    cards: [{ type: cardType, title: cardTitle, body }],
  });

  switch (type) {
    case "note":
      return make(title, card("note", title, detail));

    case "question":
      return make(title, card("question", title, detail));

    case "cards": {
      // "Group name | Title :: detail | Title :: detail" — a whole study set in one tag,
      // because the useful unit of an answer is usually several related cards, not one.
      const specs = parts
        .slice(1)
        .map(part => {
          const split = part.indexOf("::");
          const cardTitle = (split === -1 ? part : part.slice(0, split)).trim();
          const body = split === -1 ? "" : part.slice(split + 2).trim();
          return { cardTitle, body };
        })
        .filter(spec => spec.cardTitle.length > 0);

      if (specs.length === 0) {
        return make(
          title,
          null,
          "This set listed no cards, so there is nothing to add."
        );
      }

      return make(title, {
        type: "create_cards",
        groupName: title,
        cards: specs.map(spec => ({
          type: "note" as CardType,
          role: "concept" as const,
          title: spec.cardTitle,
          // Left blank rather than echoed from the title — `resolveBodiesFromProse`
          // deliberately does not touch a multi-card set, since one paragraph cannot
          // describe five different cards.
          body: spec.body,
        })),
      });
    }

    case "syllabus":
      // Deliberately the same one-argument shape as every other tag: a goal title, and
      // nothing else. The app runs the same explicit `GenerateSyllabusInteractor` call a
      // formal Mission always ran — this tag only skips having to open Mission Control
      // first when a capable model already recognized the goal in conversation.
      return make(title, { type: "generate_syllabus", goalTitle: title });

    case "link": {
      const url = normalizeUrl(title);
      const label = detail || url || title;
      if (!url) {
        return make(title, null, "That isn't a usable web address, so there's nothing to save.");
      }
      return make(label, card("source", label, url));
    }

    case "group": {
      // `[[group: 1, 3]]` — no name at all, just references. The app names it, because
      // making the model produce both a name and a reference list is one job too many.
      const firstIsRefs = parts.length === 1 && resolveCardRefs(title, cards).resolved.length > 0;
      const name = firstIsRefs ? "New group" : title;
      const refText = firstIsRefs ? title : parts.slice(1).join(", ");

      if (refText) {
        const { resolved, unresolved } = resolveCardRefs(refText, cards);
        if (unresolved.length > 0) {
          return make(
            name,
            null,
            `I couldn't match ${unresolved.length === 1 ? "one of the cards" : "some of the cards"} it named (${unresolved.join(", ")}), so there's nothing to group.`
          );
        }
        return make(name, { type: "create_group", name, cardIds: resolved });
      }

      // No references: the members are the cards the user has in context, which is the
      // only set either of us can vouch for.
      if (contextCardIds.length === 0) {
        return make(
          name,
          null,
          "There are no cards in context to put in this group. Select some and ask again."
        );
      }
      return make(name, { type: "create_group", name, cardIds: contextCardIds });
    }

    default:
      return null;
  }
}

/**
 * Resolves the way a *person* refers to a card — "1", "3", or a title — into real card
 * ids, using the numbering the briefing itself gave the model.
 *
 * Matching is deliberately loose (case-insensitive, exact title first, then a unique
 * substring) because a small model paraphrases titles. What it is not is *lenient*: an
 * ambiguous or unmatched reference is reported as unresolved, and an unresolved reference
 * costs the whole tag its intent. Nothing is ever acted on that the app didn't resolve.
 */
export function resolveCardRefs(
  text: string,
  cards: AgentTagCardRef[]
): { resolved: string[]; unresolved: string[] } {
  const resolved: string[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();

  for (const rawRef of text.split(/[,;]+/)) {
    const ref = rawRef.trim().replace(/^[#[(]+/, "").replace(/[.)\]]+$/, "").trim();
    if (!ref) continue;

    let match: AgentTagCardRef | undefined;

    if (/^\d+$/.test(ref)) {
      match = cards[Number(ref) - 1];
    } else {
      const needle = ref.toLowerCase();
      match = cards.find(card => card.title.toLowerCase() === needle);
      if (!match) {
        const partial = cards.filter(
          card =>
            card.title.toLowerCase().includes(needle) || needle.includes(card.title.toLowerCase())
        );
        // Exactly one candidate, or it isn't a reference — a guess between two cards is
        // how the wrong note ends up in a group.
        if (partial.length === 1) match = partial[0];
      }
    }

    if (!match) {
      unresolved.push(ref);
      continue;
    }
    if (seen.has(match.id)) continue;
    seen.add(match.id);
    resolved.push(match.id);
  }

  return { resolved, unresolved };
}

/** A usable http(s) URL, or "" — a bare `example.com` is upgraded, anything else refused. */
function normalizeUrl(value: string): string {
  const trimmed = value.trim().replace(/[).,]+$/, "");
  if (/^https?:\/\/\S+\.\S+/i.test(trimmed)) return trimmed;
  if (/^www\.\S+\.\S+$/i.test(trimmed)) return `https://${trimmed}`;
  return "";
}
