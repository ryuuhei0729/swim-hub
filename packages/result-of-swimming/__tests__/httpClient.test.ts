// =============================================================================
// httpClient.test.ts - サイト配慮の挙動
// =============================================================================
// 検証観点:
//   [V-H1] リクエスト間に最低間隔を空ける
//   [V-H2] キャッシュ済み URL は再取得しない
//   [V-H3] 429/5xx は指数バックオフでリトライする
//   [V-H4] リトライ回数に上限がある (無限に叩かない)
//   [V-H5] 404 はリトライしない
//   [V-H6] x-ratelimit-remaining が閾値を割ったら待つ
//   [V-H7] UA を偽装しない
// =============================================================================

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ResponseCache, cacheKey } from "../src/crawler/cache";
import { MemoryJournal } from "../src/crawler/journal";
import { PoliteHttpClient } from "../src/crawler/httpClient";

const dirs: string[] = [];
const tempDir = () => {
  const d = mkdtempSync(path.join(tmpdir(), "ros-test-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

interface FakeCall {
  url: string;
  init?: RequestInit;
}

/** 応答を順番に返す fake fetch。呼び出しを記録する */
function fakeFetch(responses: Array<{ status: number; body?: string; headers?: Record<string, string> }>) {
  const calls: FakeCall[] = [];
  let i = 0;
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses[Math.min(i, responses.length - 1)];
    if (!r) throw new Error("fakeFetch: responses must not be empty");
    i++;
    return new Response(r.body ?? "{}", { status: r.status, headers: r.headers });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

/** 実際に待たず、待機時間だけ記録する */
function fakeClock() {
  const waits: number[] = [];
  let t = 1_000_000;
  return {
    waits,
    sleepImpl: async (ms: number) => {
      waits.push(ms);
      t += ms;
    },
    nowImpl: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("PoliteHttpClient", () => {
  it("[V-H1] 2回目以降は最低間隔だけ待つ", async () => {
    const { impl, calls } = fakeFetch([{ status: 200 }]);
    const clock = fakeClock();
    const client = new PoliteHttpClient({
      fetchImpl: impl,
      sleepImpl: clock.sleepImpl,
      nowImpl: clock.nowImpl,
      minIntervalMs: 1500,
    });

    await client.get("https://x.test/a");
    await client.get("https://x.test/b");

    expect(calls).toHaveLength(2);
    expect(clock.waits).toContain(1500);
  });

  it("[V-H1] 十分時間が経っていれば待たない", async () => {
    const { impl } = fakeFetch([{ status: 200 }]);
    const clock = fakeClock();
    const client = new PoliteHttpClient({
      fetchImpl: impl,
      sleepImpl: clock.sleepImpl,
      nowImpl: clock.nowImpl,
      minIntervalMs: 1000,
    });
    await client.get("https://x.test/a");
    clock.advance(5000);
    await client.get("https://x.test/b");
    expect(clock.waits.filter((w) => w > 0)).toHaveLength(0);
  });

  it("[V-H2] キャッシュ済みなら fetch を呼ばない", async () => {
    const cache = new ResponseCache(tempDir());
    const { impl, calls } = fakeFetch([{ status: 200, body: '{"ok":1}' }]);
    const clock = fakeClock();
    const client = new PoliteHttpClient({
      cache,
      fetchImpl: impl,
      sleepImpl: clock.sleepImpl,
      nowImpl: clock.nowImpl,
    });

    const first = await client.get("https://x.test/a");
    const second = await client.get("https://x.test/a");

    expect(calls).toHaveLength(1);
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.body).toBe('{"ok":1}');
  });

  it("[V-H2] キャッシュは別プロセスでも効く (途中再開)", async () => {
    const root = tempDir();
    const { impl, calls } = fakeFetch([{ status: 200, body: '{"ok":1}' }]);
    const clock = fakeClock();
    const opts = { fetchImpl: impl, sleepImpl: clock.sleepImpl, nowImpl: clock.nowImpl };

    await new PoliteHttpClient({ ...opts, cache: new ResponseCache(root) }).get("https://x.test/a");
    // 新しいクライアント = 再起動相当
    const res = await new PoliteHttpClient({ ...opts, cache: new ResponseCache(root) }).get("https://x.test/a");

    expect(calls).toHaveLength(1);
    expect(res.fromCache).toBe(true);
  });

  it("[V-H3] 429 は指数バックオフでリトライし、成功したら返す", async () => {
    const { impl, calls } = fakeFetch([
      { status: 429 },
      { status: 429 },
      { status: 200, body: '{"ok":1}' },
    ]);
    const clock = fakeClock();
    const journal = new MemoryJournal();
    const client = new PoliteHttpClient({
      fetchImpl: impl,
      sleepImpl: clock.sleepImpl,
      nowImpl: clock.nowImpl,
      journal,
      minIntervalMs: 0,
      backoffBaseMs: 1000,
    });

    const res = await client.get("https://x.test/a");

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(3);
    // 1000, 2000 と倍々になっている
    const retries = journal.events.filter((e) => e.type === "retry");
    expect(retries.map((r) => (r as { waitMs: number }).waitMs)).toEqual([1000, 2000]);
  });

  it("[V-H4] リトライ上限を超えたら諦める (無限に叩かない)", async () => {
    const { impl, calls } = fakeFetch([{ status: 503 }]);
    const clock = fakeClock();
    const journal = new MemoryJournal();
    const client = new PoliteHttpClient({
      fetchImpl: impl,
      sleepImpl: clock.sleepImpl,
      nowImpl: clock.nowImpl,
      journal,
      minIntervalMs: 0,
      maxRetries: 2,
    });

    const res = await client.get("https://x.test/a");

    expect(calls).toHaveLength(3); // 初回 + リトライ2回
    expect(res.status).toBe(503);
    expect(journal.events.some((e) => e.type === "give_up")).toBe(true);
  });

  it("[V-H5] 404 はリトライしない", async () => {
    const { impl, calls } = fakeFetch([{ status: 404 }]);
    const clock = fakeClock();
    const client = new PoliteHttpClient({
      fetchImpl: impl,
      sleepImpl: clock.sleepImpl,
      nowImpl: clock.nowImpl,
      minIntervalMs: 0,
    });

    const res = await client.get("https://x.test/missing");

    expect(calls).toHaveLength(1);
    expect(res.status).toBe(404);
  });

  it("[V-H5] 失敗レスポンスはキャッシュしない", async () => {
    const cache = new ResponseCache(tempDir());
    const { impl, calls } = fakeFetch([{ status: 404 }]);
    const clock = fakeClock();
    const opts = { cache, fetchImpl: impl, sleepImpl: clock.sleepImpl, nowImpl: clock.nowImpl, minIntervalMs: 0 };
    await new PoliteHttpClient(opts).get("https://x.test/missing");
    await new PoliteHttpClient(opts).get("https://x.test/missing");
    expect(calls).toHaveLength(2); // キャッシュされていないので再度叩く
  });

  it("[V-H6] x-ratelimit-remaining を読み、閾値を割ったら待つ", async () => {
    const { impl } = fakeFetch([
      { status: 200, headers: { "x-ratelimit-remaining": "150", "x-ratelimit-limit": "3000" } },
      { status: 200, headers: { "x-ratelimit-remaining": "2999" } },
    ]);
    const clock = fakeClock();
    const journal = new MemoryJournal();
    const client = new PoliteHttpClient({
      fetchImpl: impl,
      sleepImpl: clock.sleepImpl,
      nowImpl: clock.nowImpl,
      journal,
      minIntervalMs: 0,
      rateLimitFloor: 200,
      throttleWaitMs: 30_000,
    });

    await client.get("https://x.test/a"); // remaining=150 を観測
    expect(client.remainingQuota).toBe(150);
    await client.get("https://x.test/b"); // 次の取得前に待つ

    const throttles = journal.events.filter((e) => e.type === "throttle");
    expect(throttles).toHaveLength(1);
    expect((throttles[0] as { waitMs: number }).waitMs).toBe(30_000);
    expect(clock.waits).toContain(30_000);
  });

  it("[V-H6] 残量が十分なら待たない", async () => {
    const { impl } = fakeFetch([{ status: 200, headers: { "x-ratelimit-remaining": "2500" } }]);
    const clock = fakeClock();
    const journal = new MemoryJournal();
    const client = new PoliteHttpClient({
      fetchImpl: impl,
      sleepImpl: clock.sleepImpl,
      nowImpl: clock.nowImpl,
      journal,
      minIntervalMs: 0,
      rateLimitFloor: 200,
    });
    await client.get("https://x.test/a");
    await client.get("https://x.test/b");
    expect(journal.events.some((e) => e.type === "throttle")).toBe(false);
  });

  it("[V-H7] User-Agent を偽装しない", async () => {
    const { impl, calls } = fakeFetch([{ status: 200 }]);
    const clock = fakeClock();
    await new PoliteHttpClient({
      fetchImpl: impl,
      sleepImpl: clock.sleepImpl,
      nowImpl: clock.nowImpl,
    }).get("https://x.test/a");

    expect(calls.length).toBeGreaterThan(0);
    const headers = (calls[0]!.init?.headers ?? {}) as Record<string, string>;
    const keys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(keys).not.toContain("user-agent");
    expect(JSON.stringify(headers).toLowerCase()).not.toContain("mozilla");
  });
});

describe("ResponseCache", () => {
  it("URL ごとに安定したキーを持つ", () => {
    expect(cacheKey("https://x.test/a")).toBe(cacheKey("https://x.test/a"));
    expect(cacheKey("https://x.test/a")).not.toBe(cacheKey("https://x.test/b"));
  });

  it("保存した内容を読み戻せる", () => {
    const cache = new ResponseCache(tempDir());
    expect(cache.has("https://x.test/a")).toBe(false);
    cache.set({ url: "https://x.test/a", status: 200, fetchedAt: "now", body: '{"v":1}' });
    expect(cache.has("https://x.test/a")).toBe(true);
    expect(cache.get("https://x.test/a")?.body).toBe('{"v":1}');
  });

  it("未保存の URL は null", () => {
    expect(new ResponseCache(tempDir()).get("https://x.test/none")).toBeNull();
  });
});
