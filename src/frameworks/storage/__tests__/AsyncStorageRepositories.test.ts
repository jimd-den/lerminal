import { describe, expect, it } from "bun:test";
import { AsyncStorageCardRepository } from "../AsyncStorageCardRepository";
import { AsyncStorageWorkspaceRepository } from "../AsyncStorageWorkspaceRepository";
import { AsyncStorageSettingsRepository } from "../AsyncStorageSettingsRepository";
import { AsyncStorageOperationLogRepository } from "../AsyncStorageOperationLogRepository";
import { AsyncStorageCardLinkRepository } from "../AsyncStorageCardLinkRepository";
import { KeyValueStore } from "../KeyValueStore";
import { PersistenceError } from "../../../usecases/ports/PersistenceError";
import { Card } from "../../../entities/card";
import { OperationRecord } from "../../../entities/operationLog";
import { resolveAppearance } from "../../../entities/appearance";

class FakeStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  failRead = false;

  async getItem(key: string): Promise<string | null> {
    if (this.failRead) throw new Error("disk unavailable");
    return this.data.get(key) ?? null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }
  async removeItem(key: string): Promise<void> {
    this.data.delete(key);
  }
}

const card = (id: string, workspaceId = "w1"): Card => ({
  id,
  workspaceId,
  type: "note",
  title: id,
  body: "b",
  createdAt: 1,
  tags: [],
});

describe("AsyncStorageCardRepository", () => {
  it("round-trips cards scoped to a workspace", async () => {
    const store = new FakeStore();
    const repo = new AsyncStorageCardRepository(store);

    await repo.saveCards([card("a"), card("b"), card("c", "w2")]);

    expect((await repo.getCardsByWorkspace("w1")).map((c) => c.id)).toEqual(["a", "b"]);
    expect(await repo.getCard("c")).toMatchObject({ id: "c" });
  });

  it("updates rather than duplicates a card saved twice", async () => {
    const store = new FakeStore();
    const repo = new AsyncStorageCardRepository(store);

    await repo.saveCard(card("a"));
    await repo.saveCard({ ...card("a"), title: "renamed" });

    const cards = await repo.getCardsByWorkspace("w1");
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe("renamed");
  });

  it("reports a read failure instead of an empty deck", async () => {
    const store = new FakeStore();
    const repo = new AsyncStorageCardRepository(store);
    await repo.saveCard(card("a"));

    store.failRead = true;
    expect(repo.getCardsByWorkspace("w1")).rejects.toBeInstanceOf(PersistenceError);
  });

  it("does not erase existing cards when a save cannot read the current set", async () => {
    const store = new FakeStore();
    const repo = new AsyncStorageCardRepository(store);
    await repo.saveCard(card("a"));

    store.failRead = true;
    await repo.saveCard(card("b")).catch(() => undefined);

    store.failRead = false;
    expect((await repo.getCardsByWorkspace("w1")).map((c) => c.id)).toEqual(["a"]);
  });

  it("deletes only the named card", async () => {
    const store = new FakeStore();
    const repo = new AsyncStorageCardRepository(store);
    await repo.saveCards([card("a"), card("b")]);

    await repo.deleteCard("a");
    expect((await repo.getCardsByWorkspace("w1")).map((c) => c.id)).toEqual(["b"]);
  });
});

describe("AsyncStorageWorkspaceRepository", () => {
  it("round-trips and deletes workspaces", async () => {
    const store = new FakeStore();
    const repo = new AsyncStorageWorkspaceRepository(store);

    await repo.saveWorkspace({ id: "w1", name: "One", createdAt: 1 } as any);
    await repo.saveWorkspace({ id: "w2", name: "Two", createdAt: 2 } as any);
    await repo.deleteWorkspace("w1");

    expect((await repo.getWorkspaces()).map((w) => w.id)).toEqual(["w2"]);
  });

  it("reports a read failure instead of an empty workspace list", async () => {
    const store = new FakeStore();
    store.failRead = true;
    expect(new AsyncStorageWorkspaceRepository(store).getWorkspaces()).rejects.toBeInstanceOf(
      PersistenceError,
    );
  });
});

describe("AsyncStorageSettingsRepository", () => {
  it("returns null before anything is saved and the settings afterwards", async () => {
    const store = new FakeStore();
    const repo = new AsyncStorageSettingsRepository(store);

    expect(await repo.getSettings()).toBeNull();
    await repo.saveSettings({ theme: "dark", accent: "teal" } as any);
    expect(await repo.getSettings()).toMatchObject({ theme: "dark" });
  });

  it("loads a settings blob still carrying the removed surfaceTint key", async () => {
    // The surface-tint control is gone, but someone who used it still has the key on
    // disk. Reading must not throw and must not take the rest of their settings — the
    // palette in particular — down with the field the app no longer knows.
    const store = new FakeStore();
    store.data.set(
      "learnimal_settings_v1",
      JSON.stringify({
        theme: "dark",
        accent: "teal",
        openRouterKey: "sk-test",
        appearance: { paletteId: "amber", surfaceTint: "graphite", density: "compact" },
      }),
    );

    const loaded = await new AsyncStorageSettingsRepository(store).getSettings();

    expect(loaded?.openRouterKey).toBe("sk-test");
    expect(resolveAppearance(loaded?.appearance).palette.id).toBe("amber");
    expect(resolveAppearance(loaded?.appearance).density).toBe("compact");
  });

  it("reports a read failure rather than silently reverting to defaults", async () => {
    const store = new FakeStore();
    store.failRead = true;
    expect(new AsyncStorageSettingsRepository(store).getSettings()).rejects.toBeInstanceOf(
      PersistenceError,
    );
  });
});

describe("AsyncStorageOperationLogRepository", () => {
  const record = (id: string, completedAt: number): OperationRecord =>
    ({ id, workspaceId: "w1", completedAt, kind: "run" }) as any;

  it("returns a workspace's records newest first", async () => {
    const store = new FakeStore();
    const repo = new AsyncStorageOperationLogRepository(store);

    await repo.saveRecord(record("old", 1));
    await repo.saveRecord(record("new", 2));

    expect((await repo.getRecords("w1")).map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("prunes the oldest records once the cap is exceeded", async () => {
    const store = new FakeStore();
    const repo = new AsyncStorageOperationLogRepository(store);

    for (let i = 0; i < 205; i++) await repo.saveRecord(record(`r${i}`, i));

    const stored = await repo.getRecords("w1");
    expect(stored).toHaveLength(200);
    expect(stored[stored.length - 1].id).toBe("r5");
    expect(await repo.getRecord("r0")).toBeNull();
  });
});

describe("AsyncStorageCardLinkRepository", () => {
  it("round-trips links scoped to a workspace and to a card", async () => {
    const store = new FakeStore();
    const repo = new AsyncStorageCardLinkRepository(store);

    await repo.saveLink({ id: "l1", workspaceId: "w1", fromCardId: "a", toCardId: "b", createdAt: "1" });
    await repo.saveLink({ id: "l2", workspaceId: "w1", fromCardId: "b", toCardId: "c", createdAt: "2" });
    await repo.saveLink({ id: "l3", workspaceId: "w2", fromCardId: "d", toCardId: "e", createdAt: "3" });

    expect((await repo.getLinksByWorkspace("w1")).map((l) => l.id)).toEqual(["l1", "l2"]);
    expect((await repo.getLinksByWorkspace("w2")).map((l) => l.id)).toEqual(["l3"]);
    expect((await repo.getLinksByCard("b")).map((l) => l.id)).toEqual(["l1", "l2"]);
  });
});
