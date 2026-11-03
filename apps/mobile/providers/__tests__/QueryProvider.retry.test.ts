// =============================================================================
// QueryProvider.retry.test.ts
// =============================================================================
//
// 通信起因の失敗はリトライせず、すぐにエラー表示へ進むことを確かめる。
// 以前は判定文字列が小文字の "network" で、React Native の
// "Network request failed" に一致せず、圏外でも 3 回 (計 7 秒以上) リトライしていた。

import { afterEach, describe, expect, it } from "vitest";
import { onlineManager } from "@tanstack/react-query";
import { NetworkTimeoutError } from "@apps/shared/utils/networkError";
import { getQueryClient, shouldRetryQuery } from "../QueryProvider";

describe("shouldRetryQuery", () => {
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it("React Native の fetch 失敗はリトライしない", () => {
    expect(shouldRetryQuery(0, new TypeError("Network request failed"))).toBe(
      false,
    );
  });

  it("postgrest-js が包んだ通信失敗 (プレーンオブジェクト) もリトライしない", () => {
    expect(
      shouldRetryQuery(0, {
        message: "TypeError: Network request failed",
        code: "",
      }),
    ).toBe(false);
  });

  it("タイムアウトはリトライしない", () => {
    expect(shouldRetryQuery(0, new NetworkTimeoutError())).toBe(false);
  });

  it("オフライン中はどんなエラーでもリトライしない", () => {
    onlineManager.setOnline(false);
    expect(shouldRetryQuery(0, new Error("boom"))).toBe(false);
  });

  it("通信以外のエラーは 3 回までリトライする", () => {
    const serverError = { message: "internal", code: "XX000" };
    expect(shouldRetryQuery(0, serverError)).toBe(true);
    expect(shouldRetryQuery(2, serverError)).toBe(true);
    expect(shouldRetryQuery(3, serverError)).toBe(false);
  });
});

describe("QueryClient の既定設定", () => {
  it("圏外で保存が一時停止したまま固まらないよう、mutation は即座に実行して失敗させる", () => {
    const defaults = getQueryClient().getDefaultOptions();
    expect(defaults.mutations?.networkMode).toBe("always");
    expect(defaults.mutations?.retry).toBe(0);
  });

  it("圏外では手元のキャッシュを捨ててまで再取得しない", () => {
    const defaults = getQueryClient().getDefaultOptions();
    const refetchOnMount = defaults.queries?.refetchOnMount as () => boolean;
    const refetchOnWindowFocus = defaults.queries
      ?.refetchOnWindowFocus as () => boolean;

    onlineManager.setOnline(false);
    expect(refetchOnMount()).toBe(false);
    expect(refetchOnWindowFocus()).toBe(false);

    onlineManager.setOnline(true);
    expect(refetchOnMount()).toBe(true);
    expect(refetchOnWindowFocus()).toBe(true);
  });
});
