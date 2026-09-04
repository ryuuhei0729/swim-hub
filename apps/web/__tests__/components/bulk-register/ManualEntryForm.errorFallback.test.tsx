/**
 * ManualEntryForm — 一括登録失敗時のエラー表示 (情報露出防止の対テスト)
 *
 * 対象は今スプリントの Sprint Contract で「テストが皆無」と分類された13ファイルの1つ。
 * handleSubmit の catch は `setError(toUserFacingMessage(err, tCommon("error")))` で
 * 表示する。生の Error と UserFacingError を対で注入し、前者は汎用フォールバックに
 * 潰され、後者はそのまま表示されることを検証する。
 *
 * 日付は today で初期化済みのため必須バリデーションは既定値のまま通過する
 * (apps/web/utils/teamBulkRegisterManual.ts の validatePracticeRows 参照)。
 */

import React from "react";
import { renderWithI18n as render, screen } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserFacingError } from "@swim-hub/shared/utils/userFacingError";

const mockBulkRegister = vi.fn();

vi.mock("@apps/shared/api/teams/bulkRegister", () => ({
  TeamBulkRegisterAPI: vi.fn().mockImplementation(() => ({
    bulkRegister: mockBulkRegister,
  })),
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ supabase: {} }),
}));

import ManualEntryForm from "@/components/bulk-register/ManualEntryForm";

describe("ManualEntryForm — 一括登録失敗時のエラー表示 — 情報露出防止の対テスト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "[V-ERR-01] bulkRegister が生の Error (RLSポリシー詳細等) で失敗した場合、" +
      "汎用フォールバック文言 (common.error) が表示され、生のエラー文字列は表示されない",
    async () => {
      const user = userEvent.setup();
      mockBulkRegister.mockRejectedValueOnce(
        new Error('relation "practices" violates row-level security policy'),
      );
      render(<ManualEntryForm teamId="team-1" />);

      await user.click(screen.getByRole("button", { name: "登録する" }));

      await screen.findByText("エラーが発生しました");
      expect(screen.queryByText(/row-level security policy/)).not.toBeInTheDocument();
    },
  );

  it(
    "[V-ERR-02] bulkRegister が UserFacingError (i18n 済みメッセージ) で失敗した場合、" +
      "そのメッセージがそのまま表示される (対照実験)",
    async () => {
      const user = userEvent.setup();
      mockBulkRegister.mockRejectedValueOnce(
        new UserFacingError("テスト用の翻訳済みメッセージ"),
      );
      render(<ManualEntryForm teamId="team-1" />);

      await user.click(screen.getByRole("button", { name: "登録する" }));

      expect(await screen.findByText("テスト用の翻訳済みメッセージ")).toBeInTheDocument();
    },
  );
});
