// =============================================================================
// fetchWithTimeout.test.ts
// =============================================================================
//
// 低速回線で応答が返ってこないとき、読み込み・保存が終わらないまま固まらず、
// 決まった時間で NetworkTimeoutError として失敗することを確かめる。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkTimeoutError } from "@apps/shared/utils/networkError";
import {
  defaultTimeoutFor,
  fetchWithTimeout,
  READ_TIMEOUT_MS,
  WRITE_TIMEOUT_MS,
} from "../fetchWithTimeout";

const originalFetch = global.fetch;

/** 呼ばれても応答を返さず、signal の中断でだけ reject する fetch */
function hangingFetch() {
  return vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        });
      }),
  );
}

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it("応答が返ってこないとき、上限時間で NetworkTimeoutError になる", async () => {
    global.fetch = hangingFetch() as unknown as typeof fetch;

    const promise = fetchWithTimeout("https://example.com", undefined, 1000);
    const assertion =
      expect(promise).rejects.toBeInstanceOf(NetworkTimeoutError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it("fetch が中断を無視しても、上限時間で必ず失敗する", async () => {
    global.fetch = vi.fn(
      () => new Promise<Response>(() => {}),
    ) as unknown as typeof fetch;

    const promise = fetchWithTimeout("https://example.com", undefined, 500);
    const assertion =
      expect(promise).rejects.toBeInstanceOf(NetworkTimeoutError);
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
  });

  it("上限時間内に応答があればそのまま返す", async () => {
    const response = { ok: true } as Response;
    global.fetch = vi
      .fn()
      .mockResolvedValue(response) as unknown as typeof fetch;

    await expect(
      fetchWithTimeout("https://example.com", { method: "GET" }, 1000),
    ).resolves.toBe(response);
  });

  it("呼び出し元の init (method / headers / body) はそのまま渡し、signal だけ差し替える", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchWithTimeout("https://example.com", {
      method: "POST",
      headers: { Authorization: "Bearer t" },
      body: "x",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer t" });
    expect(init.body).toBe("x");
    expect(init.signal).toBeDefined();
  });

  it("呼び出し元の signal で中断したら、タイムアウトではなく元の中断として失敗する", async () => {
    global.fetch = hangingFetch() as unknown as typeof fetch;
    const caller = new AbortController();

    const promise = fetchWithTimeout(
      "https://example.com",
      { signal: caller.signal },
      10_000,
    );
    caller.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("ネットワーク自体の失敗はそのまま伝える", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(
        new TypeError("Network request failed"),
      ) as unknown as typeof fetch;

    await expect(fetchWithTimeout("https://example.com")).rejects.toThrow(
      "Network request failed",
    );
  });
});

describe("defaultTimeoutFor", () => {
  it("読み取りは短く、書き込みは長い上限にする", () => {
    expect(defaultTimeoutFor("https://example.com")).toBe(READ_TIMEOUT_MS);
    expect(defaultTimeoutFor("https://example.com", { method: "get" })).toBe(
      READ_TIMEOUT_MS,
    );
    expect(defaultTimeoutFor("https://example.com", { method: "HEAD" })).toBe(
      READ_TIMEOUT_MS,
    );
    expect(defaultTimeoutFor("https://example.com", { method: "POST" })).toBe(
      WRITE_TIMEOUT_MS,
    );
    expect(defaultTimeoutFor("https://example.com", { method: "PATCH" })).toBe(
      WRITE_TIMEOUT_MS,
    );
    expect(defaultTimeoutFor("https://example.com", { method: "DELETE" })).toBe(
      WRITE_TIMEOUT_MS,
    );
  });
});
