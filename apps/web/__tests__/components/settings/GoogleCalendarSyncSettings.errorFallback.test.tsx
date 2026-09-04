/**
 * GoogleCalendarSyncSettings — 一括同期失敗時のエラー表示 (情報露出防止の対テスト)
 *
 * 対象は今スプリントの Sprint Contract で「テストが皆無」と分類された13ファイルの1つ。
 * handleBulkSync は fetch(".../sync-all") の結果を catch し、
 * `setError(toUserFacingMessage(err, tErrors("bulkSyncFailed")))` で表示する。
 * 生の Error と UserFacingError を対で注入し、前者は汎用フォールバックに潰され、
 * 後者はそのまま表示されることを検証する。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { UserProfile } from "@apps/shared/types";
import { UserFacingError } from "@swim-hub/shared/utils/userFacingError";

vi.mock("@/contexts", () => ({
  useAuth: () => ({
    signInWithOAuth: vi.fn(),
    supabase: { rpc: vi.fn(), from: vi.fn() },
    user: { id: "user-1" },
  }),
}));

import GoogleCalendarSyncSettings from "@/components/settings/GoogleCalendarSyncSettings";

const CONNECTED_PROFILE = {
  id: "user-1",
  google_calendar_enabled: true,
  google_calendar_sync_practices: true,
  google_calendar_sync_competitions: true,
} as unknown as UserProfile;

describe("GoogleCalendarSyncSettings — 一括同期失敗時のエラー表示 — 情報露出防止の対テスト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it(
    "[V-ERR-01] fetch が非OKレスポンス (生のエラー文字列を含む) を返した場合、" +
      "汎用フォールバック文言 (bulkSyncFailed) が表示され、生のエラー文字列は表示されない",
    async () => {
      const user = userEvent.setup();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          json: () =>
            Promise.resolve({ error: 'relation "practices" violates row-level security policy' }),
        }),
      );
      render(<GoogleCalendarSyncSettings profile={CONNECTED_PROFILE} onUpdate={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "既存データを同期" }));

      await screen.findByText("一括同期に失敗しました。");
      expect(screen.queryByText(/row-level security policy/)).not.toBeInTheDocument();
    },
  );

  it(
    "[V-ERR-02] catch した error が UserFacingError の場合、そのメッセージがそのまま表示される" +
      " (対照実験: toUserFacingMessage の表示側契約を fetch 境界のモックで直接検証)",
    async () => {
      const user = userEvent.setup();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() => {
          throw new UserFacingError("テスト用の翻訳済みメッセージ");
        }),
      );
      render(<GoogleCalendarSyncSettings profile={CONNECTED_PROFILE} onUpdate={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "既存データを同期" }));

      await waitFor(() => {
        expect(screen.getByText("テスト用の翻訳済みメッセージ")).toBeInTheDocument();
      });
    },
  );
});
