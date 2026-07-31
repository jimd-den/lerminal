import { KeyValueStore } from "./KeyValueStore";
import {
  CorruptedDataError,
  PersistenceError,
} from "../../usecases/ports/PersistenceError";
import { Logger, silentLogger } from "../../usecases/ports/Logger";

/**
 * # JSON Stores
 *
 * ## Business Value & Purpose
 * Every repository in this app stores one JSON value under one key and, for collections,
 * does read-modify-write. That pattern was copy-pasted nine times, each copy swallowing
 * its own errors slightly differently. It lives here once, with two guarantees the copies
 * did not have:
 *
 * 1. **Failure is never disguised as emptiness.** A missing key yields the empty value;
 *    a failed or corrupt read throws. Nothing can then overwrite good data with `[]`.
 * 2. **Read-modify-write is serialized.** Concurrent mutations queue behind one another
 *    per store, so two overlapping saves cannot lose each other's write.
 */

export interface JsonStoreOptions {
  logger?: Logger;
}

/** Serializes async work into a single chain, so read-modify-write pairs cannot interleave. */
function createMutex(): (work: () => Promise<void>) => Promise<void> {
  let tail: Promise<unknown> = Promise.resolve();
  return (work) => {
    const run = tail.then(work, work);
    // Keep the chain alive after a rejection, but let the caller see the failure.
    tail = run.catch(() => undefined);
    return run;
  };
}

/** Reads and decodes one key, distinguishing "absent" from "unreadable" from "damaged". */
async function readJson<T>(
  store: KeyValueStore,
  key: string,
  name: string,
): Promise<T | undefined> {
  let raw: string | null;
  try {
    raw = await store.getItem(key);
  } catch (error) {
    throw new PersistenceError(name, "read", error);
  }
  if (raw === null || raw === "") return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new CorruptedDataError(name, error);
  }
}

/** Encodes and writes one key. Encoding failures are write failures from the caller's view. */
async function writeJson(
  store: KeyValueStore,
  key: string,
  name: string,
  value: unknown,
): Promise<void> {
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch (error) {
    throw new PersistenceError(name, "write", error);
  }
  try {
    await store.setItem(key, encoded);
  } catch (error) {
    throw new PersistenceError(name, "write", error);
  }
}

/**
 * A single JSON document under one key — settings, a draft, anything not a collection.
 * `read()` resolves to `null` only when nothing was ever stored.
 */
export class JsonDocumentStore<T> {
  private readonly logger: Logger;

  constructor(
    private readonly key: string,
    private readonly store: KeyValueStore,
    private readonly name: string,
    options: JsonStoreOptions = {},
  ) {
    this.logger = options.logger ?? silentLogger;
  }

  async read(): Promise<T | null> {
    const value = await readJson<T>(this.store, this.key, this.name);
    return value ?? null;
  }

  async write(value: T): Promise<void> {
    await writeJson(this.store, this.key, this.name, value);
    this.logger.debug(`${this.name}.write`);
  }
}

/**
 * A JSON array under one key, with serialized read-modify-write. `readAll()` returns `[]`
 * only when the key has never been written; anything else throws.
 */
export class JsonCollectionStore<T> {
  private readonly logger: Logger;
  private readonly withLock = createMutex();

  constructor(
    private readonly key: string,
    private readonly store: KeyValueStore,
    private readonly name: string,
    options: JsonStoreOptions = {},
  ) {
    this.logger = options.logger ?? silentLogger;
  }

  async readAll(): Promise<T[]> {
    const value = await readJson<T[]>(this.store, this.key, this.name);
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new CorruptedDataError(this.name, "expected an array");
    return value;
  }

  async writeAll(items: T[]): Promise<void> {
    await this.withLock(() => writeJson(this.store, this.key, this.name, items));
  }

  /**
   * Reads, transforms, and writes back under the store's lock. If the read fails the
   * write never happens — the whole point: a transient read error cannot truncate the
   * collection.
   */
  async mutate(transform: (items: T[]) => T[]): Promise<void> {
    await this.withLock(async () => {
      const current = await this.readAll();
      await writeJson(this.store, this.key, this.name, transform(current));
      this.logger.debug(`${this.name}.mutate`);
    });
  }
}

/** Pure collection helpers, shared by every repository so upsert semantics stay identical. */

export type Identify<T> = (item: T) => string;

/** Replaces the entry with a matching id, or appends it. Never mutates the input. */
export function upsert<T>(items: T[], next: T, identify: Identify<T>): T[] {
  const id = identify(next);
  const index = items.findIndex((item) => identify(item) === id);
  if (index < 0) return [...items, next];
  const copy = [...items];
  copy[index] = next;
  return copy;
}

/** Upserts many entries in one pass, preserving the order of first appearance. */
export function upsertAll<T>(items: T[], next: T[], identify: Identify<T>): T[] {
  return next.reduce((acc, item) => upsert(acc, item, identify), items);
}

/** Drops the entry with the given id. */
export function removeById<T>(items: T[], id: string, identify: Identify<T>): T[] {
  return items.filter((item) => identify(item) !== id);
}
