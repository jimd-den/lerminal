import { describe, expect, it, beforeEach } from "bun:test";
import { AppSessionStore, createInitialDomainState } from "../AppSessionStore";

/** A snapshot cheap enough to assert on: what the store currently holds. */
const snapshotOf = (store: AppSessionStore<unknown>) => ({
  selection: [...store.domain.selection],
  openCardId: store.ui.openCardId,
  currentGroupId: store.domain.currentGroupId,
  toastMessage: store.ui.toastMessage,
});

describe("AppSessionStore", () => {
  let store: AppSessionStore<ReturnType<typeof snapshotOf>>;

  beforeEach(() => {
    store = new AppSessionStore(() => snapshotOf(store));
  });

  it("starts from defaults that are safe to render", () => {
    expect(store.domain.workspaces).toEqual([]);
    expect(store.domain.activeWorkspaceId).toBeNull();
    expect(store.ui.storageError).toBeNull();
    expect(store.domain.cardTypes.length).toBeGreaterThan(0);
  });

  it("hands each caller its own default state", () => {
    const first = createInitialDomainState();
    const second = createInitialDomainState();
    first.selection.add("a");
    first.cardTypes.pop();

    expect([...second.selection]).toEqual([]);
    expect(second.cardTypes.length).toBeGreaterThan(first.cardTypes.length);
  });

  it("delivers the current snapshot to a new subscriber immediately", () => {
    store.domain.currentGroupId = "g1";
    let seen: ReturnType<typeof snapshotOf> | null = null;
    store.subscribe((snapshot) => {
      seen = snapshot;
    });

    expect(seen!.currentGroupId).toBe("g1");
  });

  it("projects once per emit and gives every listener the same snapshot", () => {
    let projections = 0;
    const counting = new AppSessionStore(() => {
      projections++;
      return snapshotOf(counting);
    });

    const seen: unknown[] = [];
    counting.subscribe((snapshot) => seen.push(snapshot));
    counting.subscribe((snapshot) => seen.push(snapshot));
    projections = 0;

    counting.emit();
    expect(projections).toBe(1);
    expect(seen[seen.length - 1]).toBe(seen[seen.length - 2]);
  });

  it("stops notifying after unsubscribe", () => {
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    unsubscribe();
    store.emit();

    expect(calls).toBe(1); // the initial delivery only
  });

  it("replaces the selection wholesale", () => {
    store.select(["a", "b"]);
    store.select(["c"]);
    expect([...store.domain.selection]).toEqual(["c"]);
  });

  describe("forgetCards", () => {
    beforeEach(() => {
      store.select(["a", "b"]);
      store.ui.openCardId = "a";
      store.domain.currentGroupId = "g1";
    });

    it("drops removed cards from the selection but keeps the survivors", () => {
      store.forgetCards(["a"]);
      expect([...store.domain.selection]).toEqual(["b"]);
    });

    it("closes the open card only when it was removed", () => {
      store.forgetCards(["b"]);
      expect(store.ui.openCardId).toBe("a");

      store.forgetCards(["a"]);
      expect(store.ui.openCardId).toBeNull();
    });

    it("leaves the group the user is standing in unless it was removed", () => {
      store.forgetCards(["a"]);
      expect(store.domain.currentGroupId).toBe("g1");

      store.forgetCards(["g1"]);
      expect(store.domain.currentGroupId).toBeNull();
    });

    it("does nothing at all when nothing was removed", () => {
      const before = snapshotOf(store);
      store.forgetCards([]);
      expect(snapshotOf(store)).toEqual(before);
    });
  });

  it("shows a toast and clears it once it expires", async () => {
    store.showToast("Saved");
    expect(store.ui.toastMessage).toBe("Saved");

    await new Promise((resolve) => setTimeout(resolve, 2600));
    expect(store.ui.toastMessage).toBe("");
  });

  it("lets a newer toast survive the older one's expiry", async () => {
    store.showToast("First");
    await new Promise((resolve) => setTimeout(resolve, 2400));
    store.showToast("Second");

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(store.ui.toastMessage).toBe("Second");
  });
});
