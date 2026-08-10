import { Card } from "../../entities/card";
import { parseAgentTags } from "../../entities/agentTags";
import { AgentToolIntent } from "../../entities/workspaceAgent";
import {
  Contact,
  MAX_DEPTH_CAP,
  MAX_STATIONS,
  Order,
  Station,
  StationDuty,
  Watch,
  canAutoExpand,
  createContact,
  createStation,
  defaultStationName,
  dueStations,
  isOfflineDuty,
  isOutstanding,
  pruneContacts,
} from "../../entities/bridge";
import { AgentGateway } from "../ports/gateways/AgentGateway";
import { BridgeRepository } from "../ports/repositories/BridgeRepository";
import { WorkspacePulseObservation } from "../workspaceAgent/observeWorkspace";
import { WorkspaceAgentContext } from "../workspaceAgent/WorkspaceAgentWorkflow";
import {
  EMPTY_SITUATION,
  SituationReport,
  readSituation,
} from "./situationReport";
import {
  assembleContact,
  briefFor,
  contextCardsFor,
  dutyIsComputed,
  sensorContact,
  subjectFor,
  tacticalContact,
} from "./stationDuty";

/**
 * # Bridge Workflow — the watch rotation
 *
 * ## Business Value & Purpose
 * Owns the crew and the scope: which stations exist, when each one wakes, what it found,
 * and what the captain has done about it.
 *
 * ## What a watch is, and is not
 * A watch is **one bounded unit of work**: wake, read the workspace, make at most one
 * small model call, raise at most one contact, go back to sleep. It is not a conversation,
 * not an agent loop that reasons until satisfied, and not something that can spend the
 * captain's API budget without a bound. Two of the six duties make no model call at all.
 *
 * The sense that the ship is crewed comes from the *display having changed* when the
 * captain looks at it — not from anything performing activity. Which is why a watch that
 * finds nothing raises nothing: an empty scope is a true reading.
 *
 * ## The invariant, unchanged from the tag grammar
 * **Nothing a watch does changes the workspace.** Detecting, raising, escalating, and
 * expanding a contact are all readings. The only path from the scope to the card graph is
 * {@link giveOrder} — the captain's explicit tap — which is the sole method here that ever
 * calls `dispatchTool`.
 *
 * ## Repetition is escalation, not duplication
 * A sensors watch that runs every five minutes finds the same four ungrouped notes every
 * time. Raising a fresh contact each round would bury the scope in copies of one fact. So
 * a re-found reading bumps the existing contact's `raised` count instead — which is
 * exactly the signal the display needs to start pushing harder on something the captain
 * keeps ignoring. See {@link matchExisting}.
 */

/** What the workflow needs from the app but must not own. */
export interface BridgeHost {
  onChange(): void;
  activeWorkspaceId(): string | null;
  cards(): Card[];
  apiKey?(): string;
  model?(): string;
  /** The user's edited `workspace-agent` body, used when a station has no persona. */
  systemPrompt?(): string;
  /** One configured chat persona, already model-resolved, or undefined. */
  personaFor?(id: string): { name: string; model: string; systemPrompt?: string } | undefined;
  /** The live scope a dispatched order should apply to. */
  dispatchContext?(): WorkspaceAgentContext;
}

export interface BridgeWorkflowDeps {
  host: BridgeHost;
  repo?: BridgeRepository;
  agentGateway?: AgentGateway;
  /** The deterministic sweep. Injected so the sensor duty and the pulse cannot diverge. */
  observe?: (cards: Card[], workspaceId: string) => WorkspacePulseObservation | null;
  /**
   * Dispatches one confirmed intent to the real interactors, resolving with a truthful
   * completion message or rejecting with a truthful failure. The only route from the scope
   * to the workspace.
   */
  dispatchTool?: (tool: AgentToolIntent, context: WorkspaceAgentContext) => Promise<string>;
  /**
   * Opens a board topic for a station whose `autoDiscuss` is on — the one path by which a
   * station originates a discussion unattended rather than waiting for the captain's own
   * "to the table" tap. Still bounded the same way every other autonomy in this file is:
   * it starts a *conversation*, never a workspace change — nothing here can reach a card
   * without the captain's own order on whatever the topic produces.
   */
  autoConvene?: (topic: string) => void;
  now?: () => number;
  generateId?: () => string;
}

/** The station being drafted in the commissioning sheet. */
export interface StationDraft {
  name: string;
  duty: StationDuty;
  subject: string;
  personaId?: string;
  watch: Watch;
  depthCap: number;
  autoDiscuss: boolean;
}

export const EMPTY_DRAFT: StationDraft = {
  name: "",
  duty: "science",
  subject: "",
  watch: { kind: "on-report" },
  depthCap: 2,
  autoDiscuss: false,
};

export interface BridgeState {
  workspaceId: string | null;
  stations: Station[];
  contacts: Contact[];
  /** Station ids with a watch in flight right now — what makes the rail move. */
  scanning: string[];
  situation: SituationReport;
  /** When set, the scope shows only this station's contacts. */
  focusStationId: string | null;
  isCommissionOpen: boolean;
  draft: StationDraft;
  /** An actionable failure the captain should see, distinct from a station's own fault. */
  error: string | null;
  /** False until the repository has been read once, so the UI can tell empty from unloaded. */
  loaded: boolean;
}

/**
 * A bridge with nobody on watch and nothing on the scope.
 *
 * Exported because it is the honest zero value for anything that has to describe a bridge
 * it does not have one of — a projection test, a controller built without a repository —
 * and hand-rolling that shape per call site is how the two drift apart.
 */
export const EMPTY_BRIDGE_STATE: BridgeState = {
  workspaceId: null,
  stations: [],
  contacts: [],
  scanning: [],
  situation: EMPTY_SITUATION,
  focusStationId: null,
  isCommissionOpen: false,
  draft: EMPTY_DRAFT,
  error: null,
  loaded: false,
};

export class BridgeWorkflow {
  private current: BridgeState = { ...EMPTY_BRIDGE_STATE };

  constructor(private readonly deps: BridgeWorkflowDeps) {}

  get state(): BridgeState {
    return this.current;
  }

  private patch(changes: Partial<BridgeState>): void {
    this.current = { ...this.current, ...changes };
    this.deps.host.onChange();
  }

  // --- Coming to the bridge ---

  /**
   * Loads the crew and the scope for a workspace, then runs whatever is due.
   *
   * Safe to call on every visit: `on-report` watches are cooldown-gated in
   * {@link dueStations}, so arriving repeatedly costs nothing.
   */
  async open(workspaceId: string): Promise<void> {
    if (this.current.workspaceId !== workspaceId) {
      // A different ship's instruments must never be left on the panel while the new ones
      // load, so the scope is cleared before the read rather than after it.
      this.patch({ ...EMPTY_BRIDGE_STATE, workspaceId });
    }

    const repo = this.deps.repo;
    if (repo) {
      try {
        const [stations, contacts] = await Promise.all([
          repo.getStations(workspaceId),
          repo.getContacts(workspaceId),
        ]);
        this.patch({ stations, contacts, loaded: true });
      } catch {
        // An unreadable store yields an empty bridge rather than a broken one; the
        // situation strip below is computed from cards and is still completely true.
        this.patch({ loaded: true, error: "The bridge log could not be read." });
      }
    } else {
      this.patch({ loaded: true });
    }

    this.refreshSituation();
    await this.runDueWatches(true);
  }

  /** Recounts the ship's vitals from the cards in memory. No model, no network. */
  refreshSituation(): void {
    const workspaceId = this.current.workspaceId;
    if (!workspaceId) {
      this.patch({ situation: EMPTY_SITUATION });
      return;
    }
    this.patch({
      situation: readSituation(this.deps.host.cards(), workspaceId, this.now()),
    });
  }

  /** Runs every station whose watch has come due. Failures are per-station, never fatal. */
  async runDueWatches(arrivedOnBridge: boolean): Promise<void> {
    const due = dueStations(this.current.stations, this.now(), arrivedOnBridge);
    for (const station of due) {
      await this.runWatch(station.id);
    }
  }

  // --- The watch itself ---

  /**
   * Stands one watch.
   *
   * The whole method is a single bounded unit: at most one model call, at most one contact
   * raised. It never recurses on its own — automatic depth is spent by
   * {@link autoExpand} after a contact settles, and only while the station's own cap
   * allows it.
   */
  async runWatch(
    stationId: string,
    options: { parentContactId?: string | null } = {}
  ): Promise<void> {
    const station = this.current.stations.find(s => s.id === stationId);
    const workspaceId = this.current.workspaceId;
    if (!station || !workspaceId) return;
    // A station already scanning must not be started twice: two watches racing would both
    // read `contactsRaised` and stamp two contacts with the same designation.
    if (this.current.scanning.includes(stationId)) return;

    const parent = options.parentContactId
      ? this.current.contacts.find(contact => contact.id === options.parentContactId) ?? null
      : null;

    this.patch({ scanning: [...this.current.scanning, stationId] });

    // Held until the watch is fully finished. Expanding from inside the `try` would re-enter
    // `runWatch` while this station is still marked scanning, and be turned away by the
    // re-entry guard below — which is how automatic depth silently never happened.
    let raised: Contact | null = null;

    try {
      const assembled = dutyIsComputed(station.duty)
        ? this.computedWatch(station, workspaceId)
        : await this.modelWatch(station, workspaceId, parent);

      if (!assembled) {
        // Nothing found is a real, common, non-error outcome. The station's clock still
        // advances so a fruitless watch does not immediately re-run.
        await this.settleStation(station, { lastRunAt: this.now(), lastError: undefined });
        return;
      }

      const existing = this.matchExisting(station, assembled.title, parent?.id ?? null);
      if (existing) {
        // Re-found: the same reading, still outstanding. Escalate rather than duplicate.
        await this.saveContacts([
          { ...existing, raised: existing.raised + 1, updatedAt: this.now() },
        ]);
        await this.settleStation(station, { lastRunAt: this.now(), lastError: undefined });
        return;
      }

      const contact = createContact({
        id: this.generateId("ctc"),
        workspaceId,
        station,
        sequence: station.contactsRaised + 1,
        title: assembled.title,
        readout: assembled.readout,
        orders: assembled.orders,
        parentContactId: parent?.id ?? null,
        depth: parent ? parent.depth + 1 : 0,
        now: this.now(),
      });

      await this.saveContacts([contact]);
      await this.settleStation(station, {
        lastRunAt: this.now(),
        lastError: undefined,
        contactsRaised: station.contactsRaised + 1,
      });

      // The station originates a discussion itself, rather than waiting for the captain's
      // own "to the table" tap — only when they opted this specific post into it, and
      // only for a reading that is genuinely new (the re-found/escalation branch above
      // already returned, so this line is never reached for a repeat).
      if (station.autoDiscuss) {
        this.deps.autoConvene?.(topicFor(station, contact));
      }

      raised = contact;
    } catch (error: any) {
      // A fouled instrument is reported on the station, not as a contact. The scope stays
      // a list of real readings; the rail is where "this post is not working" belongs.
      await this.settleStation(station, {
        lastRunAt: this.now(),
        lastError: truthfulError(error),
      });
    } finally {
      this.patch({ scanning: this.current.scanning.filter(id => id !== stationId) });
    }

    // This watch is over — the station is free, so spending a level of automatic depth
    // starts a genuinely new one rather than re-entering this one.
    if (raised) await this.autoExpand(raised);
  }

  /** The two duties that read the workspace instead of asking a model. */
  private computedWatch(station: Station, workspaceId: string) {
    const cards = this.deps.host.cards();
    if (station.duty === "tactical") {
      return tacticalContact(cards, workspaceId, this.now());
    }
    const observation = this.deps.observe?.(cards, workspaceId) ?? null;
    return sensorContact(observation, this.current.situation);
  }

  /** One small, flat model call, and deterministic assembly of whatever comes back. */
  private async modelWatch(station: Station, workspaceId: string, parent: Contact | null) {
    const gateway = this.deps.agentGateway;
    const apiKey = (this.deps.host.apiKey?.() ?? "").trim();

    if (!apiKey) throw new Error("No API key is set, so this station cannot reach a model.");
    if (!gateway?.designWorkspaceAgentTurn) {
      throw new Error("This build has no model connection for the bridge.");
    }

    const cards = this.deps.host.cards().filter(card => card.workspaceId === workspaceId);
    const subject = subjectFor({ station, situation: this.current.situation, cards, parent });
    if (!subject) {
      throw new Error("This station has no subject to stand watch over.");
    }

    const brief = briefFor({ station, situation: this.current.situation, cards, parent });
    if (!brief) return null;

    const persona = station.personaId
      ? this.deps.host.personaFor?.(station.personaId)
      : undefined;

    const result = await gateway.designWorkspaceAgentTurn({
      briefing: brief,
      apiKey,
      model: persona?.model || (this.deps.host.model?.() ?? ""),
      systemPrompt: persona?.systemPrompt ?? this.deps.host.systemPrompt?.(),
      // A watch is a background reading, not a research request. Leaving provider search
      // off keeps a watch cheap and keeps its latency predictable; the captain has the
      // research preflight for when they actually want the web consulted.
      webSearchEnabled: false,
    });

    // Numbered exactly as the brief listed them, so a tag naming "2" resolves to the card
    // the model was actually shown.
    const contextCards = contextCardsFor(cards).map(card => ({
      id: card.id,
      title: card.title,
    }));
    const parsed = parseAgentTags(result.text ?? "", { cards: contextCards });

    return assembleContact(station, parsed, subject);
  }

  /**
   * Whether this reading is already on the scope.
   *
   * Matched on the station, the parent, and a normalized title — not on identity, which a
   * fresh model call never reproduces. Only *outstanding* contacts match: once the captain
   * has resolved or dismissed a finding, the station finding it again is genuinely new
   * information and deserves to be raised.
   */
  private matchExisting(
    station: Station,
    title: string,
    parentContactId: string | null
  ): Contact | undefined {
    const needle = normalize(title);
    return this.current.contacts.find(
      contact =>
        contact.stationId === station.id &&
        contact.parentContactId === parentContactId &&
        isOutstanding(contact) &&
        normalize(contact.title) === needle
    );
  }

  /**
   * Spends one level of the station's automatic depth, if it has any left.
   *
   * Only ever fires on a contact that carries a `tasking` order, which is the station
   * itself saying "there is something deeper here" — the app never invents a reason to
   * recurse.
   */
  private async autoExpand(contact: Contact): Promise<void> {
    const station = this.current.stations.find(s => s.id === contact.stationId);
    if (!station || !canAutoExpand(contact, station)) return;

    const tasking = contact.orders.find(order => order.tasking)?.tasking;
    if (!tasking) return;

    const target = await this.stationForDuty(tasking.duty);
    if (!target) return;
    await this.runWatch(target.id, { parentContactId: contact.id });
  }

  // --- Orders ---

  /**
   * The captain gave an order. **The only path from the scope to the workspace.**
   *
   * An order either dispatches a real intent through the app's existing interactors, or
   * tasks a station to look deeper. Both settle with a truthful outcome; neither is ever
   * retried automatically, and pressing an order twice does nothing the second time.
   */
  async giveOrder(contactId: string, orderId: string): Promise<void> {
    const contact = this.current.contacts.find(c => c.id === contactId);
    const order = contact?.orders.find(o => o.id === orderId);
    if (!contact || !order) return;
    if (order.state !== "available") return;
    if (!order.intent && !order.tasking) return;

    await this.updateOrder(contact.id, order.id, { state: "executing" }, "executing");

    if (order.tasking) {
      // Tasking changes the scope, not the workspace: a station is put to work and its
      // finding arrives as a child contact.
      try {
        const station = await this.stationForDuty(order.tasking.duty);
        if (!station) throw new Error("No station could be crewed for that.");
        if (contact.depth >= MAX_DEPTH_CAP) {
          throw new Error("This thread is as deep as the bridge will go.");
        }
        await this.updateOrder(
          contact.id,
          order.id,
          { state: "executed", outcome: `${station.name} is sounding.` },
          "acknowledged"
        );
        await this.runWatch(station.id, { parentContactId: contact.id });
      } catch (error: any) {
        await this.updateOrder(
          contact.id,
          order.id,
          { state: "failed", outcome: truthfulError(error) },
          "acknowledged"
        );
      }
      return;
    }

    const dispatch = this.deps.dispatchTool;
    if (!dispatch) {
      await this.updateOrder(
        contact.id,
        order.id,
        { state: "failed", outcome: "Nothing is wired up to carry that out." },
        "failed"
      );
      return;
    }

    try {
      const outcome = await dispatch(order.intent!, this.dispatchContext());
      await this.updateOrder(contact.id, order.id, { state: "executed", outcome }, null);
      // The contact is resolved once every order that could change something has been
      // given — a manifest with three rows is not done after the first.
      await this.settleContactState(contact.id);
      this.refreshSituation();
    } catch (error: any) {
      await this.updateOrder(
        contact.id,
        order.id,
        { state: "failed", outcome: truthfulError(error) },
        "acknowledged"
      );
    }
  }

  /** Writes one order's new state, and optionally the contact's. */
  private async updateOrder(
    contactId: string,
    orderId: string,
    changes: Partial<Order>,
    contactState: Contact["state"] | null
  ): Promise<void> {
    const contact = this.current.contacts.find(c => c.id === contactId);
    if (!contact) return;
    const next: Contact = {
      ...contact,
      orders: contact.orders.map(order =>
        order.id === orderId ? { ...order, ...changes } : order
      ),
      ...(contactState ? { state: contactState } : {}),
      updatedAt: this.now(),
    };
    await this.saveContacts([next]);
  }

  /**
   * Marks a contact resolved once nothing actionable is left available on it.
   *
   * Deliberately not "resolved on first order": a manifest offering five cards is still
   * offering four after one is logged, and calling it resolved would quietly retire an
   * offer the captain had not finished with.
   */
  private async settleContactState(contactId: string): Promise<void> {
    const contact = this.current.contacts.find(c => c.id === contactId);
    if (!contact) return;
    const outstandingOrders = contact.orders.filter(
      order => order.state === "available" && (order.intent || order.tasking)
    );
    const state: Contact["state"] = outstandingOrders.length === 0 ? "resolved" : "acknowledged";
    if (state === contact.state) return;
    await this.saveContacts([{ ...contact, state, updatedAt: this.now() }]);
  }

  /** The captain has seen it. Stops it being escalated as ignored. */
  async acknowledge(contactId: string): Promise<void> {
    const contact = this.current.contacts.find(c => c.id === contactId);
    if (!contact || contact.state !== "new") return;
    await this.saveContacts([{ ...contact, state: "acknowledged", updatedAt: this.now() }]);
  }

  /** Clears a reading off the scope without acting on it. Its children go too. */
  async dismissContact(contactId: string): Promise<void> {
    const contact = this.current.contacts.find(c => c.id === contactId);
    if (!contact) return;

    const doomed = this.withDescendants(contactId);
    const now = this.now();
    await this.saveContacts(
      this.current.contacts
        .filter(c => doomed.has(c.id))
        .map(c => ({ ...c, state: "dismissed" as const, updatedAt: now }))
    );
  }

  /** A contact and everything expanded from it, transitively. */
  private withDescendants(contactId: string): Set<string> {
    const found = new Set<string>([contactId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const contact of this.current.contacts) {
        if (
          contact.parentContactId &&
          found.has(contact.parentContactId) &&
          !found.has(contact.id)
        ) {
          found.add(contact.id);
          grew = true;
        }
      }
    }
    return found;
  }

  // --- The crew ---

  /** Opens the commissioning sheet on a fresh draft. */
  openCommission(duty: StationDuty = "science"): void {
    this.patch({ isCommissionOpen: true, draft: { ...EMPTY_DRAFT, duty }, error: null });
  }

  closeCommission(): void {
    this.patch({ isCommissionOpen: false });
  }

  updateDraft(changes: Partial<StationDraft>): void {
    this.patch({ draft: { ...this.current.draft, ...changes } });
  }

  /**
   * Puts a new station on watch.
   *
   * Refuses rather than truncates when the rail is full: silently dropping a station the
   * captain just configured is worse than telling them the rail is full.
   */
  async commission(draft: StationDraft = this.current.draft): Promise<Station | null> {
    const workspaceId = this.current.workspaceId;
    if (!workspaceId) return null;

    if (this.current.stations.length >= MAX_STATIONS) {
      this.patch({ error: `The rail is full at ${MAX_STATIONS} stations. Relieve one first.` });
      return null;
    }
    if (!isOfflineDuty(draft.duty) && !draft.subject.trim()) {
      this.patch({ error: "Give this station a subject to stand watch over." });
      return null;
    }

    const station = createStation({
      id: this.generateId("stn"),
      workspaceId,
      name: draft.name,
      duty: draft.duty,
      subject: draft.subject,
      personaId: draft.personaId,
      watch: draft.watch,
      depthCap: draft.depthCap,
      autoDiscuss: draft.autoDiscuss,
      now: this.now(),
    });

    await this.saveStation(station);
    this.patch({ isCommissionOpen: false, draft: EMPTY_DRAFT, error: null });
    // A newly crewed post reports at once — otherwise commissioning a station appears to
    // do nothing, and the captain learns not to trust the control.
    await this.runWatch(station.id);
    return station;
  }

  /** Takes a station off watch. It keeps its contacts and stops waking. */
  async relieve(stationId: string): Promise<void> {
    const station = this.current.stations.find(s => s.id === stationId);
    if (!station) return;
    await this.saveStation({ ...station, status: "relieved", updatedAt: this.now() });
  }

  /** Puts a relieved station back on watch. */
  async resume(stationId: string): Promise<void> {
    const station = this.current.stations.find(s => s.id === stationId);
    if (!station) return;
    await this.saveStation({
      ...station,
      status: "on-watch",
      lastError: undefined,
      updatedAt: this.now(),
    });
  }

  /** Removes a station and everything it ever raised. */
  async decommission(stationId: string): Promise<void> {
    await this.deps.repo?.deleteStation(stationId);
    this.patch({
      stations: this.current.stations.filter(station => station.id !== stationId),
      contacts: this.current.contacts.filter(contact => contact.stationId !== stationId),
      focusStationId: this.current.focusStationId === stationId ? null : this.current.focusStationId,
    });
  }

  /** Shows only one station's readings, or all of them again. */
  focusStation(stationId: string | null): void {
    this.patch({
      focusStationId: this.current.focusStationId === stationId ? null : stationId,
    });
  }

  clearError(): void {
    if (this.current.error === null) return;
    this.patch({ error: null });
  }

  /**
   * The station that answers for a duty, crewing a new one if none is on watch.
   *
   * Commissioning here is deliberate and visible: the new post appears on the rail, which
   * is the display telling the captain who took the order. A hidden worker would do the
   * same work and teach them nothing about what their ship is doing.
   */
  private async stationForDuty(duty: StationDuty): Promise<Station | null> {
    const existing = this.current.stations.find(
      station => station.duty === duty && station.status === "on-watch"
    );
    if (existing) return existing;

    const workspaceId = this.current.workspaceId;
    if (!workspaceId || this.current.stations.length >= MAX_STATIONS) return null;

    const station = createStation({
      id: this.generateId("stn"),
      workspaceId,
      name: defaultStationName(duty, ""),
      duty,
      // Standing: it exists to answer orders, and should not also start waking on its own.
      watch: { kind: "standing" },
      now: this.now(),
    });
    await this.saveStation(station);
    return station;
  }

  // --- Persistence ---

  /**
   * Writes a station and reflects it in state.
   *
   * Silent on storage failure by design: the panel on screen is still correct, and tearing
   * down the bridge because a write failed would cost the captain readings that are real.
   */
  private async saveStation(station: Station): Promise<void> {
    const stations = upsertById(this.current.stations, station);
    this.patch({ stations });
    try {
      await this.deps.repo?.saveStation(station);
    } catch {
      // See above: on-screen state is the source of truth; only the copy on disk is behind.
    }
  }

  /** Applies changes to a station without the caller having to rebuild the whole record. */
  private async settleStation(station: Station, changes: Partial<Station>): Promise<void> {
    const current = this.current.stations.find(s => s.id === station.id) ?? station;
    await this.saveStation({ ...current, ...changes, updatedAt: this.now() });
  }

  private async saveContacts(contacts: Contact[]): Promise<void> {
    if (contacts.length === 0) return;
    const merged = pruneContacts(
      contacts.reduce((all, contact) => upsertById(all, contact), this.current.contacts)
    );
    this.patch({ contacts: merged });
    try {
      await this.deps.repo?.saveContacts(contacts);
    } catch {
      // As above.
    }
  }

  private dispatchContext(): WorkspaceAgentContext {
    return (
      this.deps.host.dispatchContext?.() ?? { selectedCardIds: [], currentGroupId: null }
    );
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private generateId(prefix: string): string {
    if (this.deps.generateId) return this.deps.generateId();
    return `${prefix}_${Math.random().toString(36).substring(2, 10)}`;
  }
}

/** Replaces the entry with a matching id, or appends. Never mutates the input. */
function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
  const index = items.findIndex(item => item.id === next.id);
  if (index < 0) return [...items, next];
  const copy = [...items];
  copy[index] = next;
  return copy;
}

/** Whitespace- and case-insensitive, so "Linear maps" and "linear  maps" are one reading. */
function normalize(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/** A failure the captain can read, never an object stringified into the UI. */
function truthfulError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "That didn't complete. Nothing was changed.";
}

/**
 * The topic a station opens the board with when it originates a discussion itself.
 * Deliberately the same phrasing `BridgeScreen`'s own "to the table" order builds from a
 * contact by hand — a topic reads the same whether the captain tapped for it or a station
 * with `autoDiscuss` on raised it unattended.
 */
function topicFor(station: Station, contact: Contact): string {
  return `${station.name} raised this: "${contact.title}". ${summarizeReadout(contact.readout)}`;
}

/** One honest sentence about what a reading actually said — never more than it holds. */
function summarizeReadout(readout: Contact["readout"]): string {
  switch (readout.shape) {
    case "finding":
      return readout.detail ?? "";
    case "manifest":
      return `It proposed: ${readout.entries.map(entry => entry.title).join(", ")}.`;
    case "plan":
      return `It plotted a route toward ${readout.goal}.`;
    case "drill":
      return `${readout.dueCount} cards are due.`;
    case "signal":
      return readout.text;
  }
}
