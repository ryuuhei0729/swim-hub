// =============================================================================
// queryPersistence.test.ts
// =============================================================================
//
// React Query のキャッシュを端末に保存すると、ログアウトやユーザーの切り替えをまたいで
// データが残る。別のユーザーへ前のユーザーのデータを見せないことを確かめる。

import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from "@tanstack/react-query-persist-client";
import { createQueryPersistence, type CacheStore } from "../queryPersistence";

function createFakeStore(): CacheStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getString: (key) => data.get(key),
    set: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  };
}

const CACHE_KEY = "react-query-cache";
const OWNER_KEY = "react-query-cache-owner";

describe("createQueryPersistence", () => {
  it("保存したキャッシュを、別の QueryClient (= 次回起動) に復元できる", async () => {
    const store = createFakeStore();
    const { persister } = createQueryPersistence(store);
    expect(persister).not.toBeNull();

    const first = new QueryClient();
    first.setQueryData(["calendar", "2026-11-01", "2026-11-30"], [{ id: "practice-1" }]);
    await persistQueryClientSave({ queryClient: first, persister: persister!, buster: "v1" });
    expect(store.data.has(CACHE_KEY)).toBe(true);

    const second = new QueryClient();
    await persistQueryClientRestore({ queryClient: second, persister: persister!, buster: "v1" });
    expect(second.getQueryData(["calendar", "2026-11-01", "2026-11-30"])).toEqual([
      { id: "practice-1" },
    ]);
  });

  it("buster (アプリのバージョン) が変わったら、保存済みキャッシュは復元せず捨てる", async () => {
    const store = createFakeStore();
    const { persister } = createQueryPersistence(store);

    const first = new QueryClient();
    first.setQueryData(["calendar"], [{ id: "old-shape" }]);
    await persistQueryClientSave({ queryClient: first, persister: persister!, buster: "1.0.0:1" });

    const second = new QueryClient();
    await persistQueryClientRestore({
      queryClient: second,
      persister: persister!,
      buster: "1.1.0:1",
    });
    expect(second.getQueryData(["calendar"])).toBeUndefined();
    expect(store.data.has(CACHE_KEY)).toBe(false);
  });

  it("ログアウト時の clearPersisted で、保存済みキャッシュと持ち主の記録が消える", () => {
    const store = createFakeStore();
    store.set(CACHE_KEY, "{}");
    store.set(OWNER_KEY, "user-a");

    createQueryPersistence(store).clearPersisted();

    expect(store.data.size).toBe(0);
  });

  describe("bindToUser", () => {
    it("初めてのログインでは持ち主を記録するだけで、キャッシュは消さない", async () => {
      const store = createFakeStore();
      store.set(CACHE_KEY, "{}");
      const persistence = createQueryPersistence(store);
      persistence.markRestored();
      const clearMemoryCache = vi.fn();

      await persistence.bindToUser("user-a", clearMemoryCache);

      expect(clearMemoryCache).not.toHaveBeenCalled();
      expect(store.data.get(OWNER_KEY)).toBe("user-a");
      expect(store.data.has(CACHE_KEY)).toBe(true);
    });

    it("同じユーザーなら何も消さない (起動のたびに呼ばれても復元したキャッシュを保つ)", async () => {
      const store = createFakeStore();
      store.set(CACHE_KEY, "{}");
      store.set(OWNER_KEY, "user-a");
      const persistence = createQueryPersistence(store);
      persistence.markRestored();
      const clearMemoryCache = vi.fn();

      await persistence.bindToUser("user-a", clearMemoryCache);

      expect(clearMemoryCache).not.toHaveBeenCalled();
      expect(store.data.has(CACHE_KEY)).toBe(true);
    });

    it("別のユーザーがログインしたら、メモリ上と保存済みの両方のキャッシュを捨てる", async () => {
      const store = createFakeStore();
      store.set(CACHE_KEY, "{}");
      store.set(OWNER_KEY, "user-a");
      const persistence = createQueryPersistence(store);
      persistence.markRestored();
      const clearMemoryCache = vi.fn();

      await persistence.bindToUser("user-b", clearMemoryCache);

      expect(clearMemoryCache).toHaveBeenCalledTimes(1);
      expect(store.data.has(CACHE_KEY)).toBe(false);
      expect(store.data.get(OWNER_KEY)).toBe("user-b");
    });

    it("復元が終わるまでは判定を待つ (消した直後に復元されて前のユーザーのデータが戻るのを防ぐ)", async () => {
      const store = createFakeStore();
      store.set(OWNER_KEY, "user-a");
      const persistence = createQueryPersistence(store);
      const clearMemoryCache = vi.fn();

      const binding = persistence.bindToUser("user-b", clearMemoryCache);
      await Promise.resolve();
      expect(clearMemoryCache).not.toHaveBeenCalled();

      persistence.markRestored();
      await binding;
      expect(clearMemoryCache).toHaveBeenCalledTimes(1);
    });
  });

  it("保存先が無い環境 (Expo Go など) では永続化せず、各操作は何もしない", async () => {
    const persistence = createQueryPersistence(null);
    const clearMemoryCache = vi.fn();

    expect(persistence.persister).toBeNull();
    persistence.clearPersisted();
    await persistence.bindToUser("user-a", clearMemoryCache);
    expect(clearMemoryCache).not.toHaveBeenCalled();
  });
});
