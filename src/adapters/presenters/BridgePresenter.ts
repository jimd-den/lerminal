import {
  Contact,
  ContactReadout,
  DUTY_LABELS,
  Order,
  ScopeNode,
  Station,
  StationDuty,
  buildScopeTree,
  isOutstanding,
} from "../../entities/bridge";
import { BridgeState } from "../../usecases/bridge/BridgeWorkflow";
import { SituationReport } from "../../usecases/bridge/situationReport";

/**
 * # Bridge Presenter
 *
 * ## Business Value & Purpose
 * Pure projection from the watch rotation's state into exactly what the instrument panel
 * renders. No side effects, no gateway, no clock beyond the `now` it is handed — this file
 * cannot make the display claim activity, because it never runs anything.
 *
 * ## Why the readout passes straight through
 * {@link ContactReadout} is already a closed, view-ready catalog of five shapes, chosen by
 * the use-case layer from what a station actually found. Re-projecting it here would mean
 * maintaining the same five shapes twice and gaining nothing. What this file *does* add is
 * everything the display needs that the domain deliberately does not know: labels, ages,
 * counts, and whether a reading has been ignored long enough to be worth shouting about.
 *
 * ## No colours here
 * Duty colour is a theme decision and lives in the UI. The presenter names the duty; the
 * panel decides what that looks like. A presenter emitting hex codes is how an app ends up
 * with a palette the user cannot change.
 */

export interface SituationCell {
  id: string;
  label: string;
  value: string;
  /** True when this reading is something outstanding rather than merely a total. */
  attention: boolean;
}

export interface SituationViewModel {
  headline: string;
  cells: SituationCell[];
  /** 0..1, for the settled bar. */
  settled: number;
  settledLabel: string;
}

/** The vitals strip: always true, always present, never dependent on a model call. */
export function presentSituation(situation: SituationReport): SituationViewModel {
  return {
    headline: situation.headline,
    settled: situation.settled,
    settledLabel: `${Math.round(situation.settled * 100)}% settled`,
    cells: [
      { id: "total", label: "Aboard", value: String(situation.total), attention: false },
      { id: "due", label: "Due", value: String(situation.due), attention: situation.due > 0 },
      {
        id: "open",
        label: "Open Qs",
        value: String(situation.openQuestions),
        attention: situation.openQuestions > 0,
      },
      {
        id: "loose",
        label: "Loose",
        value: String(situation.ungrouped),
        attention: situation.ungrouped > 0,
      },
    ],
  };
}

export type StationStatus = "scanning" | "watching" | "standing" | "relieved" | "fouled";

export interface StationViewModel {
  id: string;
  name: string;
  duty: StationDuty;
  dutyLabel: string;
  subject: string;
  status: StationStatus;
  /** Short all-caps state for the rail: SCANNING, ON WATCH, STANDING BY, RELIEVED, FOULED. */
  statusLabel: string;
  /** When it next wakes, in the captain's terms. */
  watchLabel: string;
  /** Outstanding contacts this station has raised — the number worth showing on the rail. */
  outstanding: number;
  /** True when this station needs no model and no network. */
  offline: boolean;
  /** The last truthful failure, when fouled. */
  error?: string;
  focused: boolean;
}

/** The crew rail, in commissioning order so it does not reshuffle as watches run. */
export function presentStations(state: BridgeState): StationViewModel[] {
  return state.stations.map(station => {
    const scanning = state.scanning.includes(station.id);
    const outstanding = state.contacts.filter(
      contact => contact.stationId === station.id && isOutstanding(contact)
    ).length;

    return {
      id: station.id,
      name: station.name,
      duty: station.duty,
      dutyLabel: DUTY_LABELS[station.duty],
      subject: station.subject,
      status: statusOf(station, scanning),
      statusLabel: statusLabelOf(station, scanning),
      watchLabel: watchLabelOf(station),
      outstanding,
      offline: station.duty === "sensors" || station.duty === "tactical",
      ...(station.lastError ? { error: station.lastError } : {}),
      focused: state.focusStationId === station.id,
    };
  });
}

function statusOf(station: Station, scanning: boolean): StationStatus {
  if (scanning) return "scanning";
  if (station.status === "relieved") return "relieved";
  if (station.lastError) return "fouled";
  return station.watch.kind === "standing" ? "standing" : "watching";
}

function statusLabelOf(station: Station, scanning: boolean): string {
  switch (statusOf(station, scanning)) {
    case "scanning":
      return "SCANNING";
    case "relieved":
      return "RELIEVED";
    case "fouled":
      return "FOULED";
    case "standing":
      return "STANDING BY";
    case "watching":
      return "ON WATCH";
  }
}

function watchLabelOf(station: Station): string {
  if (station.status === "relieved") return "off duty";
  switch (station.watch.kind) {
    case "standing":
      return "when ordered";
    case "on-report":
      return "on report";
    case "interval":
      return `every ${formatMinutes(station.watch.everyMinutes)}`;
  }
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

export interface OrderViewModel {
  id: string;
  label: string;
  /** False when the order is inert — the button renders disabled with its reason. */
  available: boolean;
  state: Order["state"];
  /** The truthful reason it cannot be given, or the truthful outcome once it settled. */
  note?: string;
  /** True for an order that deepens the scope rather than changing the workspace. */
  tasking: boolean;
}

export interface ContactViewModel {
  id: string;
  bearing: string;
  title: string;
  stationName: string;
  dutyLabel: string;
  duty: StationDuty;
  readout: ContactReadout;
  orders: OrderViewModel[];
  state: Contact["state"];
  stateLabel: string;
  /** "just now", "12m", "3h", "2d" — short enough for a display, honest about age. */
  ageLabel: string;
  /**
   * True when this reading has been re-found while still outstanding. The display leans on
   * it, because a station finding the same gap for the third time is the closest thing to
   * the ship raising its voice.
   */
  escalated: boolean;
  raised: number;
  depth: number;
  outstanding: boolean;
  error?: string;
  children: ContactViewModel[];
}

export interface ScopeViewModel {
  nodes: ContactViewModel[];
  /** Outstanding readings across the whole scope, focus filter ignored. */
  outstanding: number;
  /** True when the scope is genuinely empty rather than merely filtered or unloaded. */
  empty: boolean;
  /** True when a focus filter is hiding readings that exist. */
  filtered: boolean;
}

/**
 * The scope, nested and labelled.
 *
 * Dismissed contacts are dropped here rather than in the domain: the record survives (a
 * dismissal is a decision worth keeping) but the panel is a display of what is live, and
 * showing what the captain cleared would make clearing it pointless.
 */
export function presentScope(state: BridgeState, now: number): ScopeViewModel {
  const stationsById = new Map(state.stations.map(station => [station.id, station]));
  const live = state.contacts.filter(contact => contact.state !== "dismissed");
  const visible = state.focusStationId
    ? live.filter(contact => contact.stationId === state.focusStationId)
    : live;

  const project = (node: ScopeNode): ContactViewModel => {
    const contact = node.contact;
    const station = stationsById.get(contact.stationId);
    return {
      id: contact.id,
      bearing: contact.bearing,
      title: contact.title,
      stationName: station?.name ?? DUTY_LABELS[contact.duty],
      dutyLabel: DUTY_LABELS[contact.duty],
      duty: contact.duty,
      readout: contact.readout,
      orders: contact.orders.map(presentOrder),
      state: contact.state,
      stateLabel: contactStateLabel(contact),
      ageLabel: presentAge(contact.createdAt, now),
      escalated: contact.raised > 0 && isOutstanding(contact),
      raised: contact.raised,
      depth: contact.depth,
      outstanding: isOutstanding(contact),
      ...(contact.error ? { error: contact.error } : {}),
      children: node.children.map(project),
    };
  };

  const nodes = buildScopeTree(visible).map(project);

  return {
    nodes,
    outstanding: live.filter(isOutstanding).length,
    empty: live.length === 0,
    filtered: state.focusStationId !== null && visible.length < live.length,
  };
}

function presentOrder(order: Order): OrderViewModel {
  const actionable = order.intent !== null || order.tasking !== undefined;
  return {
    id: order.id,
    label: order.label,
    available: actionable && order.state === "available",
    state: order.state,
    ...(order.refusal || order.outcome ? { note: order.outcome ?? order.refusal } : {}),
    tasking: order.tasking !== undefined,
  };
}

function contactStateLabel(contact: Contact): string {
  switch (contact.state) {
    case "new":
      return contact.raised > 0 ? `RAISED ×${contact.raised + 1}` : "NEW";
    case "acknowledged":
      return contact.raised > 0 ? `STILL OPEN ×${contact.raised + 1}` : "OPEN";
    case "executing":
      return "EXECUTING";
    case "resolved":
      return "RESOLVED";
    case "dismissed":
      return "CLEARED";
    case "failed":
      return "FOULED";
  }
}

/** Short relative age. Never "0 seconds ago", which reads as broken rather than recent. */
export function presentAge(timestamp: number, now: number): string {
  const ms = Math.max(0, now - timestamp);
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export interface BridgeViewModel {
  situation: SituationViewModel;
  stations: StationViewModel[];
  scope: ScopeViewModel;
  /** True while any watch is in flight — drives the one sweeping bar at the top. */
  scanning: boolean;
  error: string | null;
  loaded: boolean;
  isCommissionOpen: boolean;
}

/** The whole panel, in one projection. */
export function presentBridge(state: BridgeState, now: number): BridgeViewModel {
  return {
    situation: presentSituation(state.situation),
    stations: presentStations(state),
    scope: presentScope(state, now),
    scanning: state.scanning.length > 0,
    error: state.error,
    loaded: state.loaded,
    isCommissionOpen: state.isCommissionOpen,
  };
}
