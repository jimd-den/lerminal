import { describe, expect, it } from "bun:test";
import {
  Contact,
  DEFAULT_DEPTH_CAP,
  MAX_CONTACTS,
  REPORT_COOLDOWN_MS,
  Station,
  buildScopeTree,
  canAutoExpand,
  contactsToEscalate,
  createContact,
  createOrder,
  createStation,
  designation,
  dueStations,
  isOfflineDuty,
  normalizeWatch,
  pruneContacts,
  sortContacts,
  watchIsDue,
} from "../bridge";

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;

function station(overrides: Partial<Station> = {}): Station {
  return {
    ...createStation({ workspaceId: "w1", duty: "science", subject: "Eigenvectors", now: NOW }),
    ...overrides,
  };
}

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    ...createContact({
      workspaceId: "w1",
      station: station(),
      sequence: 1,
      title: "A finding",
      readout: { shape: "signal", text: "something" },
      now: NOW,
    }),
    ...overrides,
  };
}

describe("createStation", () => {
  it("names itself after the duty and subject when the captain gives no name", () => {
    expect(station().name).toBe("Science — Eigenvectors");
  });

  it("refuses a subject for a duty that reads the whole workspace", () => {
    // Storing one would put a subject on the rail that nothing ever reads.
    const sensors = createStation({
      workspaceId: "w1",
      duty: "sensors",
      subject: "ignored",
      now: NOW,
    });
    expect(sensors.subject).toBe("");
    expect(sensors.name).toBe("Sensors");
  });

  it("starts on watch, having found nothing", () => {
    expect(station().status).toBe("on-watch");
    expect(station().contactsRaised).toBe(0);
    expect(station().depthCap).toBe(DEFAULT_DEPTH_CAP);
  });
});

describe("normalizeWatch", () => {
  it("clamps an interval below the floor rather than accepting it", () => {
    // A one-minute watch would burn the API budget and the battery.
    expect(normalizeWatch({ kind: "interval", everyMinutes: 1 })).toEqual({
      kind: "interval",
      everyMinutes: 5,
    });
  });

  it("leaves the cadences that carry no number alone", () => {
    expect(normalizeWatch({ kind: "on-report" })).toEqual({ kind: "on-report" });
  });
});

describe("watchIsDue", () => {
  it("never wakes a standing watch, even on arrival", () => {
    const standing = station({ watch: { kind: "standing" } });
    expect(watchIsDue(standing, NOW, true)).toBe(false);
  });

  it("never wakes a relieved station", () => {
    const relieved = station({ watch: { kind: "on-report" }, status: "relieved" });
    expect(watchIsDue(relieved, NOW, true)).toBe(false);
  });

  it("runs an on-report watch on arrival, then holds it for the cooldown", () => {
    const post = station({ watch: { kind: "on-report" } });
    expect(watchIsDue(post, NOW, true)).toBe(true);

    // Coming back to the bridge a minute later must cost nothing.
    const justRan = { ...post, lastRunAt: NOW };
    expect(watchIsDue(justRan, NOW + MINUTE, true)).toBe(false);
    expect(watchIsDue(justRan, NOW + REPORT_COOLDOWN_MS, true)).toBe(true);
  });

  it("does not run an on-report watch when the captain did not arrive", () => {
    const post = station({ watch: { kind: "on-report" } });
    expect(watchIsDue(post, NOW, false)).toBe(false);
  });

  it("runs an interval watch immediately when it has never run", () => {
    // Otherwise commissioning a station appears to do nothing.
    const post = station({ watch: { kind: "interval", everyMinutes: 30 } });
    expect(watchIsDue(post, NOW, false)).toBe(true);
  });

  it("holds an interval watch until its interval has elapsed", () => {
    const post = station({
      watch: { kind: "interval", everyMinutes: 30 },
      lastRunAt: NOW,
    });
    expect(watchIsDue(post, NOW + 29 * MINUTE, false)).toBe(false);
    expect(watchIsDue(post, NOW + 30 * MINUTE, false)).toBe(true);
  });
});

describe("dueStations", () => {
  it("returns only what is due, in rail order", () => {
    const a = station({ id: "a", watch: { kind: "on-report" } });
    const b = station({ id: "b", watch: { kind: "standing" } });
    const c = station({ id: "c", watch: { kind: "interval", everyMinutes: 10 } });

    expect(dueStations([a, b, c], NOW, true).map(s => s.id)).toEqual(["a", "c"]);
  });
});

describe("designation", () => {
  it("stamps a duty prefix and a zero-padded sequence", () => {
    expect(designation("science", 4)).toBe("SCI-04");
    expect(designation("tactical", 12)).toBe("TAC-12");
  });
});

describe("createOrder", () => {
  it("is actionable with an intent", () => {
    const order = createOrder({
      index: 0,
      label: "Log",
      intent: { type: "create_cards", cards: [{ type: "note", title: "t", body: "b" }] },
    });
    expect(order.refusal).toBeUndefined();
    expect(order.state).toBe("available");
  });

  it("is actionable with a tasking, which changes the scope rather than the workspace", () => {
    const order = createOrder({
      index: 1,
      label: "Sound deeper",
      tasking: { duty: "science", subject: "Linear maps" },
    });
    expect(order.refusal).toBeUndefined();
    expect(order.intent).toBeNull();
  });

  it("refuses, truthfully, when there is nothing behind it", () => {
    const order = createOrder({ index: 0, label: "Log", intent: null });
    expect(order.intent).toBeNull();
    expect(order.refusal).toBeTruthy();
  });
});

describe("canAutoExpand", () => {
  it("spends the station's own depth and no more", () => {
    const post = station({ depthCap: 2 });
    expect(canAutoExpand(contact({ depth: 0 }), post)).toBe(true);
    expect(canAutoExpand(contact({ depth: 1 }), post)).toBe(true);
    expect(canAutoExpand(contact({ depth: 2 }), post)).toBe(false);
  });

  it("never expands unprompted at depth zero", () => {
    expect(canAutoExpand(contact({ depth: 0 }), station({ depthCap: 0 }))).toBe(false);
  });
});

describe("buildScopeTree", () => {
  it("nests contacts under the contact they were expanded from", () => {
    const root = contact({ id: "r", createdAt: NOW });
    const child = contact({ id: "c", parentContactId: "r", createdAt: NOW + 1 });
    const grandchild = contact({ id: "g", parentContactId: "c", createdAt: NOW + 2 });

    const tree = buildScopeTree([grandchild, root, child]);

    expect(tree).toHaveLength(1);
    expect(tree[0].contact.id).toBe("r");
    expect(tree[0].children[0].contact.id).toBe("c");
    expect(tree[0].children[0].children[0].contact.id).toBe("g");
  });

  it("promotes an orphan to the root rather than dropping it", () => {
    // Silently losing a real reading would make the scope lie.
    const orphan = contact({ id: "o", parentContactId: "gone" });
    const tree = buildScopeTree([orphan]);
    expect(tree.map(node => node.contact.id)).toEqual(["o"]);
  });

  it("reads children oldest-first, because a chain reversed is unreadable", () => {
    const root = contact({ id: "r" });
    const first = contact({ id: "1", parentContactId: "r", createdAt: NOW + 1 });
    const second = contact({ id: "2", parentContactId: "r", createdAt: NOW + 2 });

    const tree = buildScopeTree([second, first, root]);
    expect(tree[0].children.map(node => node.contact.id)).toEqual(["1", "2"]);
  });
});

describe("sortContacts", () => {
  it("puts outstanding readings above settled ones, newest first within each", () => {
    const settledOld = contact({ id: "so", state: "resolved", createdAt: NOW });
    const openOld = contact({ id: "oo", state: "new", createdAt: NOW });
    const openNew = contact({ id: "on", state: "acknowledged", createdAt: NOW + 10 });

    expect(sortContacts([settledOld, openOld, openNew]).map(c => c.id)).toEqual([
      "on",
      "oo",
      "so",
    ]);
  });
});

describe("contactsToEscalate", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("escalates an outstanding reading the captain has left alone", () => {
    const ignored = contact({ state: "new", updatedAt: NOW });
    expect(contactsToEscalate([ignored], NOW + DAY)).toHaveLength(1);
  });

  it("leaves a fresh reading alone — not yet seen is not ignored", () => {
    const fresh = contact({ state: "new", updatedAt: NOW });
    expect(contactsToEscalate([fresh], NOW + 60_000)).toHaveLength(0);
  });

  it("never escalates something already settled", () => {
    const done = contact({ state: "resolved", updatedAt: NOW });
    expect(contactsToEscalate([done], NOW + DAY)).toHaveLength(0);
  });

  it("stops shouting after the cap, because a muted instrument is worse than a quiet one", () => {
    const shouted = contact({ state: "new", updatedAt: NOW, raised: 2 });
    expect(contactsToEscalate([shouted], NOW + DAY)).toHaveLength(0);
  });
});

describe("pruneContacts", () => {
  it("leaves a scope under the cap untouched", () => {
    const few = [contact({ id: "a" }), contact({ id: "b" })];
    expect(pruneContacts(few, 10)).toEqual(few);
  });

  it("sacrifices settled readings before outstanding ones", () => {
    const outstanding = Array.from({ length: 3 }, (_, i) =>
      contact({ id: `open-${i}`, state: "new" })
    );
    const settled = Array.from({ length: 5 }, (_, i) =>
      contact({ id: `done-${i}`, state: "resolved", updatedAt: NOW + i })
    );

    const kept = pruneContacts([...outstanding, ...settled], 4);

    // Every outstanding reading survives; the oldest settled ones are what go.
    for (const open of outstanding) {
      expect(kept.some(c => c.id === open.id)).toBe(true);
    }
    expect(kept).toHaveLength(4);
    expect(kept.some(c => c.id === "done-4")).toBe(true);
  });

  it("never drops an outstanding reading to make room, even past the cap", () => {
    const many = Array.from({ length: MAX_CONTACTS + 5 }, (_, i) =>
      contact({ id: `open-${i}`, state: "new" })
    );
    expect(pruneContacts(many)).toHaveLength(MAX_CONTACTS + 5);
  });
});

describe("isOfflineDuty", () => {
  it("names exactly the two duties that need no model and no network", () => {
    expect(isOfflineDuty("sensors")).toBe(true);
    expect(isOfflineDuty("tactical")).toBe(true);
    expect(isOfflineDuty("science")).toBe(false);
    expect(isOfflineDuty("comms")).toBe(false);
  });
});
