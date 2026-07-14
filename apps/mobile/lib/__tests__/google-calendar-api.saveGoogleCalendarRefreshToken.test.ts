/**
 * google-calendar-api.ts - saveGoogleCalendarRefreshToken のユニットテスト
 *
 * Sprint Contract: Google カレンダー連携の provider_refresh_token 保存 API を
 * useGoogleAuth (warm path) / AuthProvider (コールドスタート復帰) の両方から
 * 共通利用できるよう集約したことの検証
 *
 * 注意 (Round2): この関数自体は「生のエラーメッセージ/フォールバック文言」を返す
 * 内部 API という設計のまま変更されていない。Round2 で追加された
 * localizeAuthError() によるローカライズは呼び出し側 (useGoogleAuth.ts /
 * AuthProvider.tsx の completeCalendarConnectRecovery) が Alert/setError 表示直前に
 * 行う責務であり、ここでは対象外。そのため SGT-04/05 の「Error.message をそのまま
 * 返す」というアサーションは、ローカライズ前の内部 API の戻り値仕様として妥当。
 *
 * 検証観点:
 * [SGT-01] 正常系 — response.ok の場合 { success: true } を返す (error なし)
 * [SGT-02] 異常系 — response.ok=false かつエラーJSONがある場合、その error 文言を返す
 * [SGT-03] 異常系 — response.ok=false かつ JSON パース不能な場合、フォールバック文言 (i18n) を返す
 * [SGT-04] 異常系 — fetch 自体が reject する (ネットワークエラー) 場合、Error.message を
 *          そのまま返す (ローカライズは呼び出し側の責務)
 * [SGT-05] 異常系 — fetch が非 Error 例外を投げた場合、フォールバック文言 (i18n) を返す
 * [SGT-06] リクエスト内容 — POST /api/google-calendar/connect に Authorization ヘッダーと
 *          providerRefreshToken を含む body を送信する
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// env モック (WEB_API_URL の解決用)
vi.mock("@/lib/env", () => ({
  env: {
    webApiUrl: "https://api.swimhub.example.com",
    r2PublicUrl: null,
  },
}));

// グローバル fetch モック
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { saveGoogleCalendarRefreshToken } from "@/lib/google-calendar-api";
import ja from "@apps/shared/messages/ja.json";

const FALLBACK_MESSAGE = ja.auth.mobile.calendarConnectionSaveFailed;

describe("[SGT-01] saveGoogleCalendarRefreshToken — 正常系", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("response.ok の場合 success:true を返し error は含まない", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const result = await saveGoogleCalendarRefreshToken("access-token", "refresh-token");

    expect(result).toEqual({ success: true });
  });
});

describe("[SGT-02,03] saveGoogleCalendarRefreshToken — サーバーエラー応答", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("[SGT-02] レスポンスの error 文言をそのまま返す", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "invalid provider token" }),
    });

    const result = await saveGoogleCalendarRefreshToken("access-token", "bad-refresh-token");

    expect(result).toEqual({ success: false, error: "invalid provider token" });
  });

  it("[SGT-03] JSON パースに失敗した場合は i18n フォールバック文言を返す", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
    });

    const result = await saveGoogleCalendarRefreshToken("access-token", "refresh-token");

    expect(result.success).toBe(false);
    expect(result.error).toBe(FALLBACK_MESSAGE);
  });
});

describe("[SGT-04,05] saveGoogleCalendarRefreshToken — ネットワーク例外", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("[SGT-04] fetch が Error を reject した場合、その message を返す", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));

    const result = await saveGoogleCalendarRefreshToken("access-token", "refresh-token");

    expect(result).toEqual({ success: false, error: "network down" });
  });

  it("[SGT-05] fetch が非 Error 値を reject した場合、i18n フォールバック文言を返す", async () => {
    mockFetch.mockRejectedValueOnce("string rejection");

    const result = await saveGoogleCalendarRefreshToken("access-token", "refresh-token");

    expect(result).toEqual({ success: false, error: FALLBACK_MESSAGE });
  });
});

describe("[SGT-06] saveGoogleCalendarRefreshToken — リクエスト内容", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("正しい URL・ヘッダー・body で POST する", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    await saveGoogleCalendarRefreshToken("my-access-token", "my-refresh-token");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.swimhub.example.com/api/google-calendar/connect",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer my-access-token",
        },
        body: JSON.stringify({ providerRefreshToken: "my-refresh-token" }),
      },
    );
  });
});
