import { AgentToolIntent } from "./workspaceAgent";

/**
 * # The Bridge — stations on watch, contacts on the scope, orders from the captain
 *
 * ## Business Value & Purpose
 * Every agent surface this app has had so far — the conversation sheet, the pulse banner,
 * the tag chips — shares one assumption: *the agent produces content and the user reads
 * it*. Even a well-built inbox is still a reading surface, and a reading surface makes the
 * user the audience and the agent a correspondent. That is a telephone.
 *
 * The bridge of a ship is not a telephone. Nobody asks the computer questions in a text
 * box; they look at an instrument panel that is **already showing the state of the work**.
 * The liveliness comes from the display changing, not from a persona performing aliveness
 * in prose.
 *
 * So the three nouns here are deliberately not "agent", "message", and "reply":
 *
 * - A {@link Station} is a **duty post**, not a character. It stands a watch, wakes on a
 *   schedule or a signal, does one bounded unit of work, and goes back to sleep.
 * - A {@link Contact} is a **reading on the scope**, not a message. It has a state that
 *   changes (new → acknowledged → executing → resolved), it can be expanded into more
 *   contacts, and it is never prose the user has to parse for an action.
 * - An {@link Order} is the captain's **tap on a contact**, not a sentence typed at
 *   somebody. It either dispatches a real {@link AgentToolIntent} through the app's
 *   existing interactors, or it tasks a station to look deeper.
 *
 * ## Why this shape lets a 2B model produce a full-featured display
 * No station ever holds the whole picture. Each watch is one small, flat call whose entire
 * job is to emit a few tags (`entities/agentTags`) — or, for two of the six duties, no
 * model call at all. The *display* is assembled by deterministic code from many small
 * readings. That is the split that matters: the model does language, the app does
 * structure. A station that returns nothing usable produces an honest empty scope, never a
 * fabricated contact.
 *
 * ## Nothing on the scope has happened yet
 * The invariant the tag grammar established survives intact and is the reason this file
 * can be trusted: **a contact is a reading, not an act**. Detecting, rendering, expanding,
 * and escalating a contact all change nothing in the workspace. Only {@link Order}s the
 * captain explicitly gives ever reach a dispatcher. An order whose `intent` is null is
 * visible (the station really did propose it) and inert (the app could not resolve it),
 * with a truthful {@link Order.refusal} saying why.
 *
 * Pure: no I/O, no React, no clock of its own.
 */

/**
 * The six duty posts. A closed catalog on purpose — the model is never asked to pick one,
 * the captain is, and six is a number a person can hold in their head.
 *
 * Note that **two of these never call a model at all**. `sensors` and `tactical` read the
 * workspace with plain counting, which is what makes the scope useful with no API key, no
 * network, and no model worth the name.
 */
export type StationDuty =
  /** Sweeps the workspace for structural gaps. Deterministic; no model, ever. */
  | "sensors"
  /** Hunts the prerequisites a subject rests on. One small call, recursive by design. */
  | "science"
  /** Expands a subject into chapters and material. Dispatches `expand_topic`. */
  | "engineering"
  /** Plots a route from where the workspace is to the mission goal. `generate_syllabus`. */
  | "navigation"
  /** Pushes material that is due or decaying. Deterministic; no model, ever. */
  | "tactical"
  /** Stands watch on a brief the captain wrote in their own words. One small call. */
  | "comms";

export const STATION_DUTIES: StationDuty[] = [
  "sensors",
  "science",
  "engineering",
  "navigation",
  "tactical",
  "comms",
];

/** Duties the app can run with no API key and no network. */
export const OFFLINE_DUTIES: StationDuty[] = ["sensors", "tactical"];

/** True when this duty is computed from the workspace rather than asked of a model. */
export function isOfflineDuty(duty: StationDuty): boolean {
  return OFFLINE_DUTIES.includes(duty);
}

/** The short designation prefix stamped on every contact a duty produces. */
const DUTY_PREFIX: Record<StationDuty, string> = {
  sensors: "SEN",
  science: "SCI",
  engineering: "ENG",
  navigation: "NAV",
  tactical: "TAC",
  comms: "COM",
};

/** Human names for the duty posts, for a rail the captain reads at a glance. */
export const DUTY_LABELS: Record<StationDuty, string> = {
  sensors: "Sensors",
  science: "Science",
  engineering: "Engineering",
  navigation: "Navigation",
  tactical: "Tactical",
  comms: "Comms",
};

/**
 * What each post is actually for, in the captain's terms. Shown when commissioning a
 * station, because "Science" means nothing on its own and a menu of six opaque words is
 * exactly the discoverability failure a blank text box has.
 */
export const DUTY_BRIEFS: Record<StationDuty, string> = {
  sensors: "Sweeps this workspace for gaps — ungrouped notes, unanswered questions, sources nobody has pulled in. Runs without a model.",
  science: "Hunts what a subject rests on. Each prerequisite it finds can be expanded into its own, which is how the tree gets deep.",
  engineering: "Takes one subject and builds it out into chapters and material.",
  navigation: "Plots a phased route from where this workspace is now to the goal you named.",
  tactical: "Watches what is due or going cold and pushes you back to it. Runs without a model.",
  comms: "Stands watch on a brief you write yourself, in your own words.",
};

/** Whether a duty needs a subject to watch, or reads the whole workspace. */
export function dutyNeedsSubject(duty: StationDuty): boolean {
  return !isOfflineDuty(duty);
}

/**
 * When a station wakes.
 *
 * Deliberately three cases and no cron: a watch rotation the captain cannot predict is a
 * watch rotation they will not trust. `on-report` is the one that makes the ship feel
 * crewed — the scope has already changed by the time you look at it.
 */
export type Watch =
  /** Only when explicitly ordered to. */
  | { kind: "standing" }
  /** Every time the captain comes to the bridge, at most once per {@link REPORT_COOLDOWN_MS}. */
  | { kind: "on-report" }
  /**
   * On a clock — but only while the bridge is on screen, because that is where the tick
   * lives. A watch set to thirty minutes that has not been visited in a day runs once on
   * the next visit, not forty-eight times. Said plainly here because the UI says it to the
   * captain, and a cadence that quietly does not happen in the background is exactly the
   * kind of thing an instrument must not imply.
   */
  | { kind: "interval"; everyMinutes: number };

/**
 * The floor on how often an `on-report` watch may actually run. Without it, three taps on
 * the Bridge tab in ten seconds would fire three model calls per station — the exact
 * "every interaction costs a turn" failure that makes chat expensive.
 */
export const REPORT_COOLDOWN_MS = 5 * 60 * 1000;

/** The shortest interval a station may be set to, for the same reason. */
export const MIN_WATCH_MINUTES = 5;

/**
 * How deep a station may recurse **on its own**. The captain can always expand one more
 * level by hand; this only bounds what happens without them.
 *
 * A prerequisite tree is genuinely unbounded — everything rests on something — so the cap
 * is not a performance guard but a product decision: past three levels the material stops
 * being about what the captain asked and starts being about arithmetic.
 */
export const DEFAULT_DEPTH_CAP = 2;
export const MAX_DEPTH_CAP = 4;

/** The most stations one workspace may crew. Past this the rail stops being readable. */
export const MAX_STATIONS = 8;

/**
 * The most contacts one scope holds. Older resolved and dismissed contacts are pruned
 * first — see {@link pruneContacts} — because a scope that only accumulates is a log, and
 * a log is a reading surface again.
 */
export const MAX_CONTACTS = 120;

export interface Station {
  id: string;
  workspaceId: string;
  /** What the captain called this post, e.g. "Science — eigenvectors". */
  name: string;
  duty: StationDuty;
  /**
   * What this station stands watch over. Empty for the two deterministic duties, which
   * read the whole workspace and have no subject to be given.
   */
  subject: string;
  /**
   * The chat profile that crews this post, if any. A station without one runs as plain
   * GRIOT — the voice is a flourish here, not a capability.
   */
  personaId?: string;
  watch: Watch;
  /** How deep this station may expand a contact without being told to. */
  depthCap: number;
  /**
   * Whether a genuinely new finding also opens its own board topic, unattended — the
   * station originating a discussion rather than waiting for the captain to tap "to the
   * table" on it. Off by default: escalating a reading into a whole table talking about
   * it is a bigger footprint than a quiet contact on the scope, and that jump should be
   * something the captain opted into per station, not a thing every post does by default.
   *
   * Never a bigger jump than that: a topic is discussion, not action — nothing about this
   * flag lets a station touch a card without the captain's own tap on an order.
   */
  autoDiscuss?: boolean;
  /** `relieved` is off duty: it keeps its contacts and stops waking. */
  status: "on-watch" | "relieved";
  lastRunAt?: number;
  /** The last truthful failure, kept so the rail can show a station as fouled. */
  lastError?: string;
  /** Total contacts this station has ever raised — the rail's "it is doing something". */
  contactsRaised: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * What a contact actually reads out.
 *
 * This is the closed component catalog — declarative, data not code, rendered by the app's
 * own presenters in the app's own theme. A station picks a shape by what it found; it never
 * describes styling, never emits markup, and never gets to invent a seventh shape.
 */
export type ContactReadout =
  /** Something is missing or unresolved. The workhorse of `sensors` and `science`. */
  | { shape: "finding"; headline: string; detail?: string; cardIds: string[] }
  /** A set of proposed material, listed. What `[[cards:]]` and note/question tags become. */
  | { shape: "manifest"; groupName?: string; entries: ManifestEntry[] }
  /** A phased route toward a goal. What `[[syllabus:]]` becomes. */
  | { shape: "plan"; goal: string; phases: ManifestEntry[] }
  /** Material that is due or going cold. Deterministic; `tactical` only. */
  | { shape: "drill"; dueCount: number; cardIds: string[]; oldestDueLabel?: string }
  /** The honest fallback: the station returned prose and nothing structured. */
  | { shape: "signal"; text: string };

export interface ManifestEntry {
  title: string;
  detail?: string;
}

/**
 * One thing the captain can order from a contact.
 *
 * Two flavours, and the distinction is the whole recursion story:
 * - `intent` set → dispatches to a real interactor through the app's existing dispatcher.
 * - `tasking` set → puts a station to work on this contact, producing child contacts. This
 *   is how a prerequisite grows a subtree without anything being created in the workspace.
 *
 * An order with neither is inert and must carry a {@link refusal}.
 */
export interface Order {
  /** Stable within its contact: `order-0`, `order-1`, … */
  id: string;
  label: string;
  /** The dispatchable intent, or null when the app could not resolve what was proposed. */
  intent: AgentToolIntent | null;
  /** Task a station to look deeper into this contact instead of changing the workspace. */
  tasking?: { duty: StationDuty; subject: string };
  /** Truthful reason this order cannot be given. Set if and only if it is inert. */
  refusal?: string;
  state: "available" | "executing" | "executed" | "failed";
  /** Truthful, factual outcome once it settles. */
  outcome?: string;
}

export type ContactState =
  | "new"
  | "acknowledged"
  | "executing"
  | "resolved"
  | "dismissed"
  | "failed";

export interface Contact {
  id: string;
  workspaceId: string;
  stationId: string;
  duty: StationDuty;
  /** Short designation, e.g. `SCI-04`. Identity on a display too small for a title twice. */
  bearing: string;
  title: string;
  readout: ContactReadout;
  orders: Order[];
  state: ContactState;
  /** The contact this was expanded from, or null for a contact raised by a watch. */
  parentContactId: string | null;
  /** 0 for a top-level contact. Bounded by the station's `depthCap` when automatic. */
  depth: number;
  /**
   * How many watches have re-raised this without the captain doing anything about it.
   * Drives escalation — see {@link contactsToEscalate}.
   */
  raised: number;
  createdAt: number;
  updatedAt: number;
  /** A truthful failure, when the watch that produced this contact fouled. */
  error?: string;
}

// --- Construction ---

export interface CreateStationParams {
  id?: string;
  workspaceId: string;
  name?: string;
  duty: StationDuty;
  subject?: string;
  personaId?: string;
  watch?: Watch;
  depthCap?: number;
  autoDiscuss?: boolean;
  now?: number;
}

export function createStation(params: CreateStationParams): Station {
  const now = params.now ?? Date.now();
  const duty = params.duty;
  // A deterministic post has nothing to be given a subject about; storing one anyway would
  // show a subject on the rail that nothing ever reads.
  const subject = dutyNeedsSubject(duty) ? (params.subject ?? "").trim() : "";
  return {
    id: params.id ?? `stn_${randomSuffix()}`,
    workspaceId: params.workspaceId,
    name: (params.name ?? "").trim() || defaultStationName(duty, subject),
    duty,
    subject,
    ...(params.personaId ? { personaId: params.personaId } : {}),
    watch: normalizeWatch(params.watch ?? { kind: "standing" }),
    depthCap: clamp(params.depthCap ?? DEFAULT_DEPTH_CAP, 0, MAX_DEPTH_CAP),
    ...(params.autoDiscuss ? { autoDiscuss: true } : {}),
    status: "on-watch",
    contactsRaised: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** A name the captain did not have to think of, and would probably have written anyway. */
export function defaultStationName(duty: StationDuty, subject: string): string {
  const label = DUTY_LABELS[duty];
  const trimmed = subject.trim();
  return trimmed ? `${label} — ${trimmed}` : label;
}

/** Clamps an interval watch to something that cannot melt the battery or the API budget. */
export function normalizeWatch(watch: Watch): Watch {
  if (watch.kind !== "interval") return watch;
  return {
    kind: "interval",
    everyMinutes: Math.max(MIN_WATCH_MINUTES, Math.round(watch.everyMinutes)),
  };
}

export interface CreateContactParams {
  id?: string;
  workspaceId: string;
  station: Station;
  /** The running count of contacts this station has raised, for the designation. */
  sequence: number;
  title: string;
  readout: ContactReadout;
  orders?: Order[];
  parentContactId?: string | null;
  depth?: number;
  error?: string;
  now?: number;
}

export function createContact(params: CreateContactParams): Contact {
  const now = params.now ?? Date.now();
  return {
    id: params.id ?? `ctc_${randomSuffix()}`,
    workspaceId: params.workspaceId,
    stationId: params.station.id,
    duty: params.station.duty,
    bearing: designation(params.station.duty, params.sequence),
    title: params.title.trim() || "Unnamed contact",
    readout: params.readout,
    orders: params.orders ?? [],
    state: params.error ? "failed" : "new",
    parentContactId: params.parentContactId ?? null,
    depth: params.depth ?? 0,
    raised: 0,
    createdAt: now,
    updatedAt: now,
    ...(params.error ? { error: params.error } : {}),
  };
}

/** `SCI-04` — the duty's prefix and a zero-padded sequence. */
export function designation(duty: StationDuty, sequence: number): string {
  const n = Math.max(1, Math.floor(sequence));
  return `${DUTY_PREFIX[duty]}-${String(n).padStart(2, "0")}`;
}

/** Builds an order, refusing anything with nothing behind it rather than showing a dead tap. */
export function createOrder(params: {
  index: number;
  label: string;
  intent?: AgentToolIntent | null;
  tasking?: { duty: StationDuty; subject: string };
  refusal?: string;
}): Order {
  const intent = params.intent ?? null;
  const actionable = intent !== null || params.tasking !== undefined;
  return {
    id: `order-${params.index}`,
    label: params.label,
    intent,
    ...(params.tasking ? { tasking: params.tasking } : {}),
    ...(actionable
      ? {}
      : { refusal: params.refusal ?? "There is nothing behind this one to carry out." }),
    state: "available",
  };
}

// --- Watch scheduling (pure) ---

/**
 * Whether a station is due to wake.
 *
 * `standing` never is — it runs only when ordered. `on-report` is gated by
 * {@link REPORT_COOLDOWN_MS} so returning to the bridge repeatedly costs nothing. An
 * interval watch that has never run is due immediately, which is what makes commissioning
 * a station feel like it took effect.
 */
export function watchIsDue(station: Station, now: number, arrivedOnBridge: boolean): boolean {
  if (station.status !== "on-watch") return false;

  switch (station.watch.kind) {
    case "standing":
      return false;
    case "on-report":
      if (!arrivedOnBridge) return false;
      return elapsed(station.lastRunAt, now) >= REPORT_COOLDOWN_MS;
    case "interval":
      return elapsed(station.lastRunAt, now) >= station.watch.everyMinutes * 60 * 1000;
  }
}

/** Every station that should wake right now, in rail order. */
export function dueStations(
  stations: Station[],
  now: number,
  arrivedOnBridge: boolean
): Station[] {
  return stations.filter(station => watchIsDue(station, now, arrivedOnBridge));
}

/**
 * Milliseconds since a station last ran. A station that has never run is treated as
 * infinitely overdue, so a fresh commission reports at once.
 */
function elapsed(lastRunAt: number | undefined, now: number): number {
  if (lastRunAt === undefined) return Number.POSITIVE_INFINITY;
  return Math.max(0, now - lastRunAt);
}

/** Whether a station may expand this contact one more level without being told to. */
export function canAutoExpand(contact: Contact, station: Station): boolean {
  return contact.depth < station.depthCap;
}

// --- The scope (pure) ---

/** Contacts still wanting the captain's attention. */
export function isOutstanding(contact: Contact): boolean {
  return contact.state === "new" || contact.state === "acknowledged";
}

/**
 * Contacts the tactical watch should push harder on: outstanding, old enough to have been
 * ignored rather than merely not-yet-seen, and not already shouted about too many times.
 *
 * Escalation is bounded on purpose. A system that nags without limit gets muted, and a
 * muted instrument is worse than a quiet one — the captain stops believing the display.
 */
export function contactsToEscalate(
  contacts: Contact[],
  now: number,
  options: { afterMs?: number; maxRaises?: number } = {}
): Contact[] {
  const afterMs = options.afterMs ?? 24 * 60 * 60 * 1000;
  const maxRaises = options.maxRaises ?? 2;
  return contacts.filter(
    contact =>
      isOutstanding(contact) &&
      contact.raised < maxRaises &&
      now - contact.updatedAt >= afterMs
  );
}

/**
 * The scope in reading order: outstanding contacts newest first, then everything settled.
 *
 * Children are deliberately *not* interleaved here — {@link buildScopeTree} does the
 * nesting, so this stays a plain ordering that a test can state in one sentence.
 */
export function sortContacts(contacts: Contact[]): Contact[] {
  const rank = (contact: Contact): number => (isOutstanding(contact) ? 0 : 1);
  return [...contacts].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return b.createdAt - a.createdAt;
  });
}

export interface ScopeNode {
  contact: Contact;
  children: ScopeNode[];
}

/**
 * Nests contacts into the tree their `parentContactId` describes — the knowledge graph
 * rendered as a tactical display rather than a nested list of prose.
 *
 * A contact whose parent has been pruned or dismissed is promoted to the root rather than
 * dropped: it is still a real reading, and silently losing it would make the scope lie.
 */
export function buildScopeTree(contacts: Contact[]): ScopeNode[] {
  const present = new Set(contacts.map(contact => contact.id));
  const childrenOf = new Map<string, Contact[]>();
  const roots: Contact[] = [];

  for (const contact of contacts) {
    const parentId = contact.parentContactId;
    if (parentId && present.has(parentId)) {
      const siblings = childrenOf.get(parentId) ?? [];
      siblings.push(contact);
      childrenOf.set(parentId, siblings);
    } else {
      roots.push(contact);
    }
  }

  const build = (contact: Contact): ScopeNode => ({
    contact,
    // Children read oldest-first: they are a sequence of findings, and reversing a
    // prerequisite chain makes it unreadable.
    children: [...(childrenOf.get(contact.id) ?? [])]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(build),
  });

  return sortContacts(roots).map(build);
}

/**
 * Keeps the scope bounded, sacrificing settled contacts before outstanding ones and older
 * before newer. Outstanding contacts are never dropped to make room for settled ones —
 * losing an unanswered finding to a cap would be the display quietly forgetting something
 * it told the captain mattered.
 */
export function pruneContacts(contacts: Contact[], limit: number = MAX_CONTACTS): Contact[] {
  if (contacts.length <= limit) return contacts;

  const outstanding = contacts.filter(isOutstanding);
  const settled = contacts
    .filter(contact => !isOutstanding(contact))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const room = Math.max(0, limit - outstanding.length);
  const kept = new Set([...outstanding, ...settled.slice(0, room)].map(contact => contact.id));
  // Original order is preserved so pruning never doubles as a re-sort.
  return contacts.filter(contact => kept.has(contact.id));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function randomSuffix(): string {
  return Math.random().toString(36).substring(2, 10);
}
