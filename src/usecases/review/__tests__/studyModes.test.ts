import { describe, expect, it } from "bun:test";
import { createInitialSchedule, gradeSchedule } from "../../../entities/schedule";
import { StartReviewInteractor } from "../StartReviewInteractor";
import { ClozeCommand } from "../../pipeline/ClozeCommand";
import { makeCloze } from "../../commands";
import { MemoryCardRepository } from "../../../adapters/repositories/MemoryCardRepository";
import { createCard } from "../../../entities/card";
import { CommandContext } from "../../pipeline/Command";

const DAY = 86400000;
const NOW = 1718582400000;

function ctx(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    workspaceId: "ws-1", parentId: null, inputCards: [], workspaces: [],
    apiKey: "", model: "m", systemPrompt: "p", chunkSystemPrompt: "cp", expansionStack: [],
    ...overrides,
  };
}

describe("Four-level spaced repetition", () => {
  it("grows intervals by grade and counts lapses on 'again'", () => {
    const s0 = createInitialSchedule(NOW); // interval 1

    const good = gradeSchedule(s0, "good", NOW);
    expect(good.interval).toBe(3); // round(1*2.4)+1
    expect(good.reps).toBe(1);

    const hard = gradeSchedule(good, "hard", NOW);
    expect(hard.interval).toBe(Math.round(3 * 1.2) + 1); // 4

    const easy = gradeSchedule(good, "easy", NOW);
    expect(easy.interval).toBe(Math.round(3 * 3.2) + 2); // 12
    expect(easy.dueAt).toBe(NOW + 12 * DAY);

    const again = gradeSchedule(easy, "again", NOW);
    expect(again.interval).toBe(1);
    expect(again.dueAt).toBe(NOW + 600000);
    expect(again.lapses).toBe(1);
  });
});

describe("Interleaved review queue", () => {
  it("alternates cards across topics (parent groups)", () => {
    const sched = createInitialSchedule(0); // due in the past relative to NOW
    const q = (id: string, parentId: string) =>
      createCard({ id, workspaceId: "w", type: "question", title: id, body: "", answer: "a", parentId, schedule: sched });
    const cards = [q("a1", "A"), q("a2", "A"), q("b1", "B"), q("b2", "B")];

    const queue = new StartReviewInteractor().execute(cards, NOW, true);

    // Consecutive cards should not share a parent topic.
    for (let i = 1; i < queue.length; i++) {
      expect(queue[i].parentId).not.toBe(queue[i - 1].parentId);
    }
  });
});

describe("Cloze generation", () => {
  it("blanks salient terms and records the answer", () => {
    const cloze = makeCloze("Photosynthesis converts sunlight into chemical energy in chloroplasts.");
    expect(cloze).not.toBeNull();
    expect(cloze!.prompt).toContain("_____");
    expect(cloze!.answer.length).toBeGreaterThan(0);
  });

  it("cloze command produces reviewable cloze cards", async () => {
    const repo = new MemoryCardRepository();
    const cmd = new ClozeCommand(repo);
    const chunk = createCard({ workspaceId: "ws-1", type: "chunk", title: "Mitochondria", body: "Mitochondria are the powerhouse of the eukaryotic cell." });

    const result = await cmd.execute("", ctx({ inputCards: [chunk] }));

    expect(result.kind).toBe("cards");
    if (result.kind !== "cards") return;
    expect(result.cards[0].type).toBe("question");
    expect(result.cards[0].typeId).toBe("cloze");
    expect(result.cards[0].title).toContain("_____");
  });
});
