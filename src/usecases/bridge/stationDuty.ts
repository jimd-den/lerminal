import { Card } from "../../entities/card";
import { ParsedAgentMessage, ParsedAgentTag } from "../../entities/agentTags";
import { AgentToolIntent } from "../../entities/workspaceAgent";
import {
  Contact,
  ContactReadout,
  ManifestEntry,
  Order,
  Station,
  StationDuty,
  createOrder,
} from "../../entities/bridge";
import { WorkspacePulseObservation } from "../workspaceAgent/observeWorkspace";
import { SituationReport, dueCards, overdueLabel } from "./situationReport";

/**
 * # Station Duty — what a watch asks, and what the app builds from the answer
 *
 * ## Business Value & Purpose
 * This file is the Agent-View-Controller split, made concrete. The model's entire job on a
 * watch is to write a few sentences and drop a few tags in them — the one thing a 2B–4B
 * model does reliably. Everything that makes the bridge *look* like it took a frontier
 * model to produce — the designation, the manifest rows, the order buttons, the tree, the
 * states — is assembled here, deterministically, from those few tags.
 *
 * So the two halves are strictly separated:
 *
 * - {@link briefFor} — what leaves the device. Short, flat, one job, and it names the
 *   *one* tag shape the duty wants. A long prompt asking for a nested structure is how you
 *   get a small model to fail; a short prompt asking for three tags is how you get one to
 *   succeed.
 * - {@link assembleContact} — what the app builds from what came back. It never asks the
 *   model for a shape, a layout, a colour, or a component. It reads the tags and picks a
 *   readout from a closed catalog of five.
 *
 * ## The refusal that keeps the scope honest
 * A watch that returns nothing parseable raises **no contact**. Not an empty one, not a
 * "the model had trouble" one — none. The scope shows only readings that exist, so a
 * quiet display means a quiet workspace rather than a failed call the user has to
 * interpret. Failures are recorded on the *station* (`lastError`), which is where a fouled
 * instrument belongs.
 *
 * Pure: no I/O, no React, no gateway, no clock of its own.
 */

/** How many cards of context a watch is allowed to carry. Small models drown past this. */
const CONTEXT_BUDGET = 12;
/** How much of a card's body a briefing line may spend. */
const LINE_BUDGET = 220;

export interface BriefInput {
  station: Station;
  situation: SituationReport;
  /** The workspace's cards, already scoped. Ordered by whatever the caller thinks matters. */
  cards: Card[];
  /**
   * The contact being expanded, when this watch was ordered from one. Its title is the
   * subject the brief actually asks about — that is how a prerequisite tree gets deeper
   * without the captain retyping anything.
   */
  parent?: Contact | null;
}

/**
 * The subject a watch is really about: the contact it was expanded from, or the station's
 * own standing subject.
 */
export function subjectFor(input: BriefInput): string {
  const fromParent = input.parent?.title?.trim();
  return fromParent || input.station.subject.trim();
}

/**
 * The prompt for one watch.
 *
 * Every one of these is deliberately under a dozen lines, asks for **one** tag shape, and
 * states the count. "Give me three" outperforms "give me some" on a small model by a wide
 * margin, and a stated ceiling is what stops a 2B model from listing forty.
 *
 * The two deterministic duties never reach here — see {@link isOfflineDuty} — so this
 * function throwing for them would be dead code; it returns an empty brief instead, and
 * the caller treats an empty brief as "do not call a model".
 */
export function briefFor(input: BriefInput): string {
  const { station, situation } = input;
  const subject = subjectFor(input);
  const context = contextLines(input.cards);

  switch (station.duty) {
    case "science":
      return [
        `The learner wants to understand: ${subject}`,
        "",
        "Name the 3 things someone must already understand before this makes sense.",
        "Write each one as a tag on its own line, with a one-sentence explanation after the pipe:",
        "",
        "[[note: Name of the prerequisite | Why it is needed, in one sentence.]]",
        "",
        "Only the three tags. No preamble, no list numbers, no closing remarks.",
        context,
      ]
        .filter(Boolean)
        .join("\n");

    case "engineering":
      return [
        `Break this subject into chapters: ${subject}`,
        "",
        "Give 4 to 6 chapters in teaching order, as a single tag:",
        "",
        "[[cards: " + (subject || "Subject") + " | First chapter :: what it covers | Second chapter :: what it covers]]",
        "",
        "One tag only. Each chapter needs the `::` and a short description after it.",
        context,
      ]
        .filter(Boolean)
        .join("\n");

    case "navigation":
      return [
        `The learner's goal: ${subject}`,
        "",
        "If this is a real mastery goal, emit exactly one tag naming it:",
        "",
        "[[syllabus: " + (subject || "The goal") + "]]",
        "",
        "Then one sentence saying what the first phase should cover. Nothing else.",
        context,
      ]
        .filter(Boolean)
        .join("\n");

    case "comms":
      return [
        "Standing brief from the learner:",
        subject,
        "",
        "Answer it in two or three sentences.",
        "If your answer suggests material worth keeping, add up to 3 tags:",
        "",
        "[[note: Title | The point, in one sentence.]]",
        "[[question: A question worth answering | Why it matters.]]",
        "",
        `For reference, this workspace holds ${situation.total} cards.`,
        context,
      ]
        .filter(Boolean)
        .join("\n");

    // The deterministic duties are computed, never asked. An empty brief is the signal.
    case "sensors":
    case "tactical":
      return "";
  }
}

/** The cards a watch carries, numbered exactly as `parseAgentTags` will resolve them. */
function contextLines(cards: Card[]): string {
  const scoped = cards.slice(0, CONTEXT_BUDGET);
  if (scoped.length === 0) return "";
  const lines = scoped.map(
    (card, index) => `${index + 1}. ${card.title}: ${card.body}`.slice(0, LINE_BUDGET)
  );
  return ["", "Cards already in this workspace, numbered:", ...lines].join("\n");
}

/** The cards a brief should carry — the same list, so numbering and resolution agree. */
export function contextCardsFor(cards: Card[]): Card[] {
  return cards.slice(0, CONTEXT_BUDGET);
}

// --- Assembly: tags in, contact parts out ---

export interface AssembledContact {
  title: string;
  readout: ContactReadout;
  orders: Order[];
}

/**
 * Builds the contact a watch produced, or null when nothing usable came back.
 *
 * The shape is chosen by what the model actually emitted, with the duty only breaking
 * ties. That ordering matters: a science watch that happens to return a syllabus tag
 * should read out as a plan, because that is what it found. Forcing the duty's preferred
 * shape onto the reply would be the app overriding the reading.
 */
export function assembleContact(
  station: Station,
  parsed: ParsedAgentMessage,
  subject: string
): AssembledContact | null {
  const actionable = parsed.tags.filter(tag => tag.intent !== null);
  const prose = parsed.text.trim();

  const syllabus = actionable.find(tag => tag.type === "syllabus");
  if (syllabus) return planContact(station, syllabus, parsed, subject);

  const set = actionable.find(tag => tag.type === "cards");
  if (set) return manifestFromSet(station, set, subject);

  const material = actionable.filter(tag => tag.type === "note" || tag.type === "question");
  if (material.length > 0) return manifestFromTags(station, material, subject);

  const topic = actionable.find(tag => tag.type === "topic");
  if (topic) return findingFromTopic(station, topic, prose);

  const link = actionable.find(tag => tag.type === "link");
  if (link) return findingFromLink(station, link, prose);

  // Nothing structured. Prose alone is still a real reading — but only if it is prose,
  // rather than the whitespace a model returns when it has nothing.
  if (prose.length >= 12) return signalContact(station, prose, subject);

  return null;
}

/** A plan: the phases the model named, with the real syllabus run behind one order. */
function planContact(
  station: Station,
  tag: ParsedAgentTag,
  parsed: ParsedAgentMessage,
  subject: string
): AssembledContact {
  // Phases come from the prose around the tag rather than from the tag, which carries only
  // a goal title by design. Anything we cannot read is simply absent, never invented.
  const phases: ManifestEntry[] = sentences(parsed.text)
    .slice(0, 6)
    .map(text => ({ title: text }));

  return {
    title: tag.title || subject || "Route",
    readout: { shape: "plan", goal: tag.title || subject, phases },
    orders: [
      createOrder({ index: 0, label: "Plot the route", intent: tag.intent }),
      expandOrder(1, station, tag.title || subject),
    ],
  };
}

/** A set tag is already a manifest — the one tag shape that carries several rows. */
function manifestFromSet(
  station: Station,
  tag: ParsedAgentTag,
  subject: string
): AssembledContact {
  const intent = tag.intent;
  const entries: ManifestEntry[] =
    intent?.type === "create_cards"
      ? intent.cards.map(card => ({
          title: card.title,
          ...(card.body ? { detail: card.body } : {}),
        }))
      : [];

  return {
    title: tag.title || subject || "Proposed material",
    readout: { shape: "manifest", groupName: tag.title, entries },
    orders: [
      createOrder({
        index: 0,
        label: entries.length > 0 ? `Log all ${entries.length}` : "Log",
        intent,
      }),
      expandOrder(1, station, tag.title || subject),
    ],
  };
}

/**
 * Several note/question tags become one manifest with a row each, plus a combined order.
 *
 * The combined order is built here rather than asked for: merging N single-card intents
 * into one `create_cards` is trivial for code and is exactly the kind of structure a small
 * model gets wrong. It also means one tap logs the whole finding, which is the difference
 * between a display the captain uses and one they scroll past.
 */
function manifestFromTags(
  station: Station,
  tags: ParsedAgentTag[],
  subject: string
): AssembledContact {
  const entries: ManifestEntry[] = tags.map(tag => ({
    title: tag.title,
    ...(bodyOf(tag) ? { detail: bodyOf(tag) } : {}),
  }));

  const orders: Order[] = [];
  const groupName = subject ? `${subject} — foundations` : undefined;

  if (tags.length > 1) {
    orders.push(
      createOrder({ index: orders.length, label: `Log all ${tags.length}`, intent: mergeCards(tags, groupName) })
    );
  }
  // A row each, so the captain can take two of three findings — the common case, and one a
  // single "accept everything" button would force them out of.
  tags.forEach(tag => {
    orders.push(createOrder({ index: orders.length, label: `Log “${truncate(tag.title, 28)}”`, intent: tag.intent }));
  });
  orders.push(expandOrder(orders.length, station, subject || tags[0].title));

  return {
    title: subject ? `Foundations under ${subject}` : tags[0].title,
    readout: { shape: "manifest", ...(groupName ? { groupName } : {}), entries },
    orders,
  };
}

/** A topic tag is a lead worth pulling, not material — a finding with an expansion behind it. */
function findingFromTopic(
  station: Station,
  tag: ParsedAgentTag,
  prose: string
): AssembledContact {
  return {
    title: tag.title,
    readout: {
      shape: "finding",
      headline: tag.title,
      ...(prose ? { detail: truncate(prose, 400) } : {}),
      cardIds: [],
    },
    orders: [
      createOrder({ index: 0, label: "Build it out", intent: tag.intent }),
      expandOrder(1, station, tag.title),
    ],
  };
}

function findingFromLink(
  station: Station,
  tag: ParsedAgentTag,
  prose: string
): AssembledContact {
  return {
    title: tag.title,
    readout: {
      shape: "finding",
      headline: tag.title,
      ...(prose ? { detail: truncate(prose, 400) } : {}),
      cardIds: [],
    },
    orders: [createOrder({ index: 0, label: "Keep the source", intent: tag.intent })],
  };
}

/**
 * Prose with no tags. The app supplies the offer the model did not: keeping the answer as
 * a note is almost always the useful thing, and building that intent in code means a model
 * too small to emit a single tag still produces something the captain can act on.
 */
function signalContact(
  station: Station,
  prose: string,
  subject: string
): AssembledContact {
  const title = subject || firstSentence(prose) || "Signal";
  return {
    title: truncate(title, 80),
    readout: { shape: "signal", text: prose },
    orders: [
      createOrder({
        index: 0,
        label: "Log it as a note",
        intent: {
          type: "create_cards",
          cards: [{ type: "note", title: truncate(title, 80), body: prose }],
        },
      }),
      expandOrder(1, station, title),
    ],
  };
}

/**
 * The order that makes the scope a tree: task the science watch on this contact.
 *
 * Offered from every model-backed contact rather than only from prerequisites, because
 * "what does *this* rest on" is the question that keeps being worth asking, and the
 * captain should never have to go and commission a station to ask it.
 */
function expandOrder(index: number, station: Station, subject: string): Order {
  return createOrder({
    index,
    label: "Sound deeper",
    tasking: { duty: "science", subject },
  });
}

// --- The deterministic duties ---

/**
 * The sensor sweep: an observation about the workspace, computed by plain counting.
 *
 * Takes `observeWorkspace`'s existing output rather than re-deriving it — that function is
 * already the app's one honest answer to "what is notable here", and having two would let
 * the pulse banner and the scope disagree about the same workspace.
 */
export function sensorContact(
  observation: WorkspacePulseObservation | null,
  situation: SituationReport
): AssembledContact | null {
  if (!observation) return null;

  const orders: Order[] = [];
  if (observation.kind === "unlinked-note-cluster" && observation.cardIds.length > 0) {
    orders.push(
      createOrder({
        index: 0,
        label: `Group these ${observation.cardIds.length}`,
        intent: {
          type: "create_group",
          name: "Grouped by sensors",
          cardIds: [...observation.cardIds],
        },
      })
    );
  }
  if (observation.kind === "unextracted-source" && observation.cardIds[0]) {
    orders.push(
      createOrder({
        index: 0,
        label: "Pull the text in",
        intent: { type: "extract_url", cardId: observation.cardIds[0] },
      })
    );
  }

  return {
    title: observation.message,
    readout: {
      shape: "finding",
      headline: observation.message,
      detail: situation.headline,
      cardIds: [...observation.cardIds],
    },
    orders,
  };
}

/**
 * The tactical push: what is due, and how long it has been waiting.
 *
 * Deliberately carries no order that dispatches an intent — reviewing is something the
 * captain does in the review modal, not something an agent can do on their behalf. The
 * contact's job is to be impossible to miss, which is the whole of "push the user to study
 * more" done honestly.
 */
export function tacticalContact(
  cards: Card[],
  workspaceId: string,
  now: number
): AssembledContact | null {
  const due = dueCards(cards, workspaceId, now);
  if (due.length === 0) return null;

  const label = overdueLabel(due, now);
  return {
    title: `${due.length} ${due.length === 1 ? "card is" : "cards are"} due`,
    readout: {
      shape: "drill",
      dueCount: due.length,
      cardIds: due.map(card => card.id),
      ...(label ? { oldestDueLabel: label } : {}),
    },
    orders: [],
  };
}

// --- helpers ---

/** The body a note/question tag will actually create, for the manifest row. */
function bodyOf(tag: ParsedAgentTag): string {
  const intent = tag.intent;
  if (intent?.type !== "create_cards") return "";
  return intent.cards[0]?.body ?? "";
}

/** Merges several single-card intents into one, so "log all" is a single operation. */
function mergeCards(tags: ParsedAgentTag[], groupName?: string): AgentToolIntent | null {
  const cards = tags.flatMap(tag =>
    tag.intent?.type === "create_cards" ? tag.intent.cards : []
  );
  if (cards.length === 0) return null;
  return {
    type: "create_cards",
    ...(groupName ? { groupName } : {}),
    cards,
  };
}

function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [])
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 8);
}

function firstSentence(text: string): string {
  return sentences(text)[0] ?? "";
}

function truncate(text: string, limit: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit - 1).trimEnd()}…`;
}

/** Duties whose watch is computed rather than asked. Mirrors `entities/bridge`. */
export function dutyIsComputed(duty: StationDuty): boolean {
  return duty === "sensors" || duty === "tactical";
}
