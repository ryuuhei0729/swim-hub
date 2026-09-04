/**
 * CompetitionBasicForm — 保存失敗時のエラー表示 (情報露出防止の対テスト)
 *
 * 対象は今スプリントの Sprint Contract で「テストが皆無」と分類された13ファイルの1つ。
 * submitForm の catch は `setValidationError(toUserFacingMessage(error, tCommon("error")))`
 * で表示する。onSubmit はプロパティとして直接注入できるため、それを reject させることで
 * 単独で検証する。
 */

import React from "react";
import { renderWithI18n as render, screen } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserFacingError } from "@swim-hub/shared/utils/userFacingError";

vi.mock("@/contexts", () => ({
  useAuth: () => ({ subscription: null }),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(() => ({})),
}));

vi.mock("@apps/shared/api", () => ({
  CompetitionAPI: vi.fn().mockImplementation(() => ({
    getUniqueCompetitionPlaces: vi.fn().mockResolvedValue([]),
  })),
}));

import CompetitionBasicForm from "@/components/forms/CompetitionBasicForm";

describe("CompetitionBasicForm — 保存失敗時のエラー表示 — 情報露出防止の対テスト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "[V-ERR-01] onSubmit が生の Error (RLSポリシー詳細等) で失敗した場合、" +
      "汎用フォールバック文言 (common.error) が表示され、生のエラー文字列は表示されない",
    async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockRejectedValue(
        new Error('relation "competitions" violates row-level security policy'),
      );
      render(
        <CompetitionBasicForm
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={onSubmit}
          selectedDate={new Date("2026-01-01")}
          teamMode={true}
        />,
      );

      await user.click(screen.getByTestId("competition-save-button"));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("エラーが発生しました");
      expect(alert).not.toHaveTextContent("row-level security policy");
      expect(screen.queryByText(/row-level security policy/)).not.toBeInTheDocument();
    },
  );

  it(
    "[V-ERR-02] onSubmit が UserFacingError (i18n 済みメッセージ) で失敗した場合、" +
      "そのメッセージがそのまま表示される (対照実験)",
    async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockRejectedValue(
        new UserFacingError("テスト用の翻訳済みメッセージ"),
      );
      render(
        <CompetitionBasicForm
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={onSubmit}
          selectedDate={new Date("2026-01-01")}
          teamMode={true}
        />,
      );

      await user.click(screen.getByTestId("competition-save-button"));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("テスト用の翻訳済みメッセージ");
    },
  );
});
