/**
 * useFullPageRouter / toLocalizedPath
 *
 * ページ遷移のキャッシュ (next.config.mjs の staleTimes) を有効にしたため、ログイン・ログアウトの
 * 直後はページ全体を読み直して、前のユーザーの画面のキャッシュを使い回さないようにしている。
 * 遷移先がサイト内のロケール付きパスになることと、外部への遷移に使えないことを確かめる。
 */

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useLocale: () => "en" }));

import { toLocalizedPath, useFullPageRouter } from "@/i18n/fullPageNavigation";

describe("toLocalizedPath", () => {
  it("ロケールを先頭に付ける (クエリも保つ)", () => {
    expect(toLocalizedPath("/dashboard", "ja")).toBe("/ja/dashboard");
    expect(toLocalizedPath("/teams/t-1?tab=members", "en")).toBe("/en/teams/t-1?tab=members");
  });

  it("トップ (/) はロケールだけにする", () => {
    expect(toLocalizedPath("/", "ja")).toBe("/ja");
  });

  it("サイト外を指すもの (プロトコル相対・絶対URL・相対パス) はトップへ送る", () => {
    expect(toLocalizedPath("//evil.com", "ja")).toBe("/ja");
    expect(toLocalizedPath("https://evil.com", "ja")).toBe("/ja");
    expect(toLocalizedPath("dashboard", "ja")).toBe("/ja");
  });
});

describe("useFullPageRouter", () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  function stubLocation() {
    const location = { assign: vi.fn(), replace: vi.fn() };
    Object.defineProperty(window, "location", { configurable: true, value: location });
    return location;
  }

  it("push はページを読み直す遷移 (location.assign) を、今のロケール付きで行う", () => {
    const location = stubLocation();
    const { result } = renderHook(() => useFullPageRouter());

    result.current.push("/dashboard");

    expect(location.assign).toHaveBeenCalledWith("/en/dashboard");
    expect(location.replace).not.toHaveBeenCalled();
  });

  it("replace は履歴を残さずに読み直す (ログアウト後に「戻る」で前の画面へ戻らない)", () => {
    const location = stubLocation();
    const { result } = renderHook(() => useFullPageRouter());

    result.current.replace("/login");

    expect(location.replace).toHaveBeenCalledWith("/en/login");
    expect(location.assign).not.toHaveBeenCalled();
  });
});
