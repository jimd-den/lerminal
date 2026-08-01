import { describe, expect, it } from "bun:test";
import {
  JsonCollectionStore,
  JsonDocumentStore,
  removeById,
  upsert,
  upsertAll,
} from "../JsonStore";
import { KeyValueStore } from "../KeyValueStore";
import {
  CorruptedDataError,
  PersistenceError,
} from "../../../usecases/ports/PersistenceError";

/** An in-memory store whose reads and writes can be made to fail on demand. */
class FakeStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  failRead = false;
  failWrite = false;
  writes = 0;

  async getItem(key: string): Promise<string | null> {
    if (this.failRead) throw new Error("disk unavailable");
    return this.data.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.failWrite) throw new Error("disk full");
    this.writes++;
    this.data.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.data.delete(key);
  }
}

interface Item {
  id: string;
  value: number;
}

const collection = (store: KeyValueStore) =>
  new JsonCollectionStore<Item>("k", store, "items");

const identify = (item: Item) => item.id;

describe("JsonCollectionStore", () => {
  it("reads an empty collection only when nothing was ever stored", async () => {
    const store = new FakeStore();
    expect(await collection(store).readAll()).toEqual([]);
  });

  it("throws instead of reporting empty when the read fails", async () => {
    const store = new FakeStore();
    store.failRead = true;
    expect(collection(store).readAll()).rejects.toBeInstanceOf(PersistenceError);
  });

  it("throws instead of reporting empty when the stored data is damaged", async () => {
    const store = new FakeStore();
    store.data.set("k", "{not json");
    expect(collection(store).readAll()).rejects.toBeInstanceOf(CorruptedDataError);
  });

  it("treats a non-array payload as damage rather than coercing it", async () => {
    const store = new FakeStore();
    store.data.set("k", JSON.stringify({ id: "a" }));
    expect(collection(store).readAll()).rejects.toBeInstanceOf(CorruptedDataError);
  });

  it("never overwrites stored data when the read half of a mutation fails", async () => {
    const store = new FakeStore();
    await collection(store).writeAll([{ id: "a", value: 1 }]);
    const before = store.data.get("k");

    store.failRead = true;
    expect(
      collection(store).mutate((items) => [...items, { id: "b", value: 2 }]),
    ).rejects.toBeInstanceOf(PersistenceError);

    store.failRead = false;
    expect(store.data.get("k")).toBe(before!);
  });

  it("surfaces write failures to the caller", async () => {
    const store = new FakeStore();
    store.failWrite = true;
    expect(collection(store).writeAll([{ id: "a", value: 1 }])).rejects.toBeInstanceOf(
      PersistenceError,
    );
  });

  it("serializes concurrent mutations so neither loses the other's write", async () => {
    const store = new FakeStore();
    const items = collection(store);

    await Promise.all([
      items.mutate((all) => upsert(all, { id: "a", value: 1 }, identify)),
      items.mutate((all) => upsert(all, { id: "b", value: 2 }, identify)),
      items.mutate((all) => upsert(all, { id: "c", value: 3 }, identify)),
    ]);

    const stored = await items.readAll();
    expect(stored.map((item) => item.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("keeps accepting mutations after one of them fails", async () => {
    const store = new FakeStore();
    const items = collection(store);

    store.failWrite = true;
    await items.mutate((all) => all).catch(() => undefined);

    store.failWrite = false;
    await items.mutate((all) => upsert(all, { id: "a", value: 1 }, identify));
    expect(await items.readAll()).toEqual([{ id: "a", value: 1 }]);
  });
});

describe("JsonDocumentStore", () => {
  it("returns null only when nothing was ever saved", async () => {
    const store = new FakeStore();
    expect(await new JsonDocumentStore<Item>("k", store, "doc").read()).toBeNull();
  });

  it("throws rather than returning null when the read fails", async () => {
    const store = new FakeStore();
    store.failRead = true;
    expect(new JsonDocumentStore<Item>("k", store, "doc").read()).rejects.toBeInstanceOf(
      PersistenceError,
    );
  });

  it("round-trips a document", async () => {
    const store = new FakeStore();
    const doc = new JsonDocumentStore<Item>("k", store, "doc");
    await doc.write({ id: "a", value: 7 });
    expect(await doc.read()).toEqual({ id: "a", value: 7 });
  });
});

describe("collection helpers", () => {
  it("replaces a matching entry in place and appends a new one", () => {
    const items: Item[] = [{ id: "a", value: 1 }];
    expect(upsert(items, { id: "a", value: 9 }, identify)).toEqual([{ id: "a", value: 9 }]);
    expect(upsert(items, { id: "b", value: 2 }, identify)).toHaveLength(2);
  });

  it("does not mutate its input", () => {
    const items: Item[] = [{ id: "a", value: 1 }];
    upsert(items, { id: "a", value: 9 }, identify);
    expect(items).toEqual([{ id: "a", value: 1 }]);
  });

  it("upserts many entries in one pass", () => {
    const items: Item[] = [{ id: "a", value: 1 }];
    const next = upsertAll(items, [{ id: "a", value: 5 }, { id: "b", value: 2 }], identify);
    expect(next).toEqual([{ id: "a", value: 5 }, { id: "b", value: 2 }]);
  });

  it("removes by id", () => {
    expect(removeById([{ id: "a", value: 1 }], "a", identify)).toEqual([]);
  });
});
