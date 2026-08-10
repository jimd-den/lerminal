import { describe, expect, it } from "bun:test";
import { parseAgentTags } from "../../../entities/agentTags";
import { Station, createStation } from "../../../entities/bridge";
import { assembleContact, briefFor, sensorContact, tacticalContact } from "../stationDuty";
import { EMPTY_SITUATION, readSituation } from "../situationReport";
import { Card, createCard } from "../../../entities/card";

const NOW = 1_700_000_000_000;

const station = (overrides: Partial<Station> = {}): Station => ({
  ...createStation({ workspaceId: "w1", duty: "science", subject: "Eigenvectors", now: NOW }),
  ...overrides,
});

const assemble = (text: string, post = station(), subject = "Eigenvectors") =>
  assembleContact(post, parseAgentTags(text), subject);

function card(overrides: Partial<Card> = {}): Card {
  return {
    ...createCard({ workspaceId: "w1", type: "note", title: "A note", body: "body" }),
    ...overrides,
  };
}

describe("briefFor", () => {
  it("asks a small model for one tag shape, with the count stated", () => {
    const brief = briefFor({
      station: station(),
      situation: EMPTY_SITUATION,
      cards: [],
    });
    expect(brief).toContain("Eigenvectors");
    expect(brief).toContain("[[note:");
    // A stated ceiling is what stops a 2B model listing forty.
    expect(brief).toContain("3 things");
  });

  it("asks about the contact it was expanded from, not the station's own subject", () => {
    const brief = briefFor({
      station: station(),
      situation: EMPTY_SITUATION,
      cards: [],
      parent: {
        id: "c1",
        workspaceId: "w1",
        stationId: "s1",
        duty: "science",
        bearing: "SCI-01",
        title: "Linear maps",
        readout: { shape: "signal", text: "x" },
        orders: [],
        state: "new",
        parentContactId: null,
        depth: 0,
        raised: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    });
    // This is how the tree gets deeper without the captain retyping anything.
    expect(brief).toContain("Linear maps");
    expect(brief).not.toContain("Eigenvectors");
  });

  it("returns nothing for a duty that is computed rather than asked", () => {
    const brief = briefFor({
      station: station({ duty: "sensors", subject: "" }),
      situation: EMPTY_SITUATION,
      cards: [],
    });
    expect(brief).toBe("");
  });
});

describe("assembleContact — the app builds the structure", () => {
  it("turns three flat note tags into one manifest with a row each", () => {
    const assembled = assemble(
      [
        "[[note: Linear maps | A function between vector spaces.]]",
        "[[note: Determinants | A scalar summarising a matrix.]]",
        "[[note: Bases | A minimal spanning set.]]",
      ].join("\n")
    )!;

    expect(assembled.readout.shape).toBe("manifest");
    if (assembled.readout.shape !== "manifest") throw new Error("wrong shape");
    expect(assembled.readout.entries).toHaveLength(3);
    expect(assembled.readout.entries[0].detail).toBe("A function between vector spaces.");
  });

  it("builds the combined order itself, which is the merge a small model gets wrong", () => {
    const assembled = assemble(
      ["[[note: A | one]]", "[[note: B | two]]", "[[note: C | three]]"].join("\n")
    )!;

    const logAll = assembled.orders.find(order => order.label.startsWith("Log all"))!;
    expect(logAll).toBeDefined();
    expect(logAll.intent?.type).toBe("create_cards");
    if (logAll.intent?.type !== "create_cards") throw new Error("wrong intent");
    // One tap logs the whole finding; the rows remain so two of three is still possible.
    expect(logAll.intent.cards).toHaveLength(3);
    expect(assembled.orders.filter(order => order.label.startsWith("Log “"))).toHaveLength(3);
  });

  it("offers no combined order for a single finding, which would be a duplicate button", () => {
    const assembled = assemble("[[note: Linear maps | They come first.]]")!;
    expect(assembled.orders.some(order => order.label.startsWith("Log all"))).toBe(false);
  });

  it("always offers a way to go deeper, so the tree is reachable from any reading", () => {
    const assembled = assemble("[[note: Linear maps | They come first.]]")!;
    const deeper = assembled.orders.find(order => order.tasking)!;
    expect(deeper.tasking?.duty).toBe("science");
  });

  it("reads a set tag out as a manifest with its group name", () => {
    const assembled = assemble(
      "[[cards: WebGPU | Pipelines :: how work is described | Buffers :: how data gets there]]"
    )!;

    expect(assembled.readout.shape).toBe("manifest");
    if (assembled.readout.shape !== "manifest") throw new Error("wrong shape");
    expect(assembled.readout.groupName).toBe("WebGPU");
    expect(assembled.readout.entries.map(entry => entry.title)).toEqual([
      "Pipelines",
      "Buffers",
    ]);
  });

  it("lets what the model found beat the duty's preference", () => {
    // A science watch that returns a syllabus reads out as a plan, because that is what
    // it found. Forcing the duty's shape would be the app overriding the reading.
    const assembled = assemble("[[syllabus: Master WebGPU]] First, the pipeline model.")!;
    expect(assembled.readout.shape).toBe("plan");
  });

  it("falls back to a signal, and supplies the offer the model did not", () => {
    // A model too small to emit a single tag still produces something actionable, because
    // the app builds the "keep this" intent itself.
    const assembled = assemble("Eigenvectors are the directions a transformation preserves.")!;

    expect(assembled.readout.shape).toBe("signal");
    const log = assembled.orders.find(order => order.intent)!;
    expect(log.intent?.type).toBe("create_cards");
  });

  it("raises nothing at all from an empty or whitespace reply", () => {
    // An empty scope is a true reading; an empty contact is noise.
    expect(assemble("   ")).toBeNull();
    expect(assemble("")).toBeNull();
  });

  it("raises nothing from prose too short to be a reading", () => {
    expect(assemble("ok")).toBeNull();
  });
});

describe("the computed duties", () => {
  it("reads a sensor sweep out with the order that resolves it", () => {
    const assembled = sensorContact(
      {
        kind: "unlinked-note-cluster",
        message: "4 notes are sitting ungrouped at the top level.",
        cardIds: ["a", "b", "c", "d"],
      },
      EMPTY_SITUATION
    )!;

    expect(assembled.readout.shape).toBe("finding");
    const group = assembled.orders[0];
    expect(group.intent?.type).toBe("create_group");
  });

  it("raises nothing when the sweep found nothing", () => {
    expect(sensorContact(null, EMPTY_SITUATION)).toBeNull();
  });

  it("reads due material out, and offers no order to study on the captain's behalf", () => {
    const cards = [
      card({ id: "a", schedule: { dueAt: NOW - 86400000, interval: 1, reps: 1 } }),
      card({ id: "b", schedule: { dueAt: NOW - 1000, interval: 1, reps: 1 } }),
      card({ id: "c" }),
    ];

    const assembled = tacticalContact(cards, "w1", NOW)!;

    expect(assembled.readout.shape).toBe("drill");
    if (assembled.readout.shape !== "drill") throw new Error("wrong shape");
    expect(assembled.readout.dueCount).toBe(2);
    expect(assembled.readout.oldestDueLabel).toBe("1 day overdue");
    // Reviewing is the captain's to do; nothing here can do it for them.
    expect(assembled.orders).toHaveLength(0);
  });

  it("raises nothing when nothing is due", () => {
    expect(tacticalContact([card({ id: "a" })], "w1", NOW)).toBeNull();
  });
});

describe("readSituation", () => {
  it("counts rather than claims, and never divides by zero", () => {
    expect(readSituation([], "w1", NOW).total).toBe(0);

    const report = readSituation(
      [
        card({ id: "a" }),
        card({ id: "q", type: "question", answer: "" }),
        card({ id: "s", type: "source", cite: "https://example.com", body: "" }),
      ],
      "w1",
      NOW
    );

    expect(report.total).toBe(3);
    expect(report.openQuestions).toBe(1);
    expect(report.unextractedSources).toBe(1);
    expect(report.settled).toBeGreaterThanOrEqual(0);
    expect(report.settled).toBeLessThanOrEqual(1);
  });

  it("leads with what is due, because material going cold is the time-sensitive reading", () => {
    const report = readSituation(
      [
        card({ id: "q", type: "question", answer: "" }),
        card({ id: "d", schedule: { dueAt: NOW - 1, interval: 1, reps: 1 } }),
      ],
      "w1",
      NOW
    );
    expect(report.headline).toContain("due for review");
  });

  it("says so plainly when there is nothing outstanding", () => {
    const report = readSituation([card({ id: "a", parentId: "g" })], "w1", NOW);
    expect(report.headline).toContain("All quiet");
  });
});
