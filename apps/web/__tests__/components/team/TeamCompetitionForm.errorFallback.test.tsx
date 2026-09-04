/**
 * TeamCompetitionForm — 作成失敗時のエラー表示 (情報露出防止の対テスト)
 *
 * 対象は今スプリントの Sprint Contract で「テストが皆無」と分類された13ファイルの1つ。
 * handleSubmit の catch は `setError(toUserFacingMessage(err, t("createFailed")))` で
 * 表示する。
 *
 * - [V-ERR-01] (生の Error): TeamRecordsAPI.create が生の RLS エラーで失敗するケース。
 * - [V-ERR-02] (UserFacingError): 未認証 (`supabase.auth.getUser()` が user:null を返す)
 *   ケース。TeamCompetitionForm.tsx:64 `throw new UserFacingError(t("authRequired"))`
 *   という実際の組織的な UserFacingError 送出経路であり、合成ではない。
 */

import React from "react";
import { renderWithI18n as render, screen } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@apps/shared/api/teams/records", () => ({
  TeamRecordsAPI: vi.fn().mockImplementation(() => ({
    create: mockCreate,
  })),
}));

let currentAuthMock: {
  supabase: { auth: { getUser: ReturnType<typeof vi.fn> } };
};

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => currentAuthMock,
}));

import TeamCompetitionForm from "@/components/team/TeamCompetitionForm";

describe("TeamCompetitionForm — 作成失敗時のエラー表示 — 情報露出防止の対テスト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const submitForm = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByTestId("team-competition-submit-button"));
  };

  it(
    "[V-ERR-01] TeamRecordsAPI.create が生の Error (RLSポリシー詳細等) で失敗した場合、" +
      "汎用フォールバック文言 (createFailed) が表示され、生のエラー文字列は表示されない",
    async () => {
      const user = userEvent.setup();
      currentAuthMock = {
        supabase: {
          auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
        },
      };
      mockCreate.mockRejectedValueOnce(
        new Error('relation "competitions" violates row-level security policy'),
      );
      render(
        <TeamCompetitionForm isOpen={true} onClose={vi.fn()} teamId="team-1" onSuccess={vi.fn()} />,
      );

      await submitForm(user);

      const errorEl = await screen.findByTestId("team-competition-error");
      expect(errorEl).toHaveTextContent("チーム大会の作成に失敗しました");
      expect(errorEl).not.toHaveTextContent("row-level security policy");
      expect(screen.queryByText(/row-level security policy/)).not.toBeInTheDocument();
    },
  );

  it(
    "[V-ERR-02] 未認証 (UserFacingError = authRequired、実際の送出経路) の場合、" +
      "そのメッセージがそのまま表示される (対照実験)",
    async () => {
      const user = userEvent.setup();
      currentAuthMock = {
        supabase: {
          auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
        },
      };
      render(
        <TeamCompetitionForm isOpen={true} onClose={vi.fn()} teamId="team-1" onSuccess={vi.fn()} />,
      );

      await submitForm(user);

      const errorEl = await screen.findByTestId("team-competition-error");
      expect(errorEl).toHaveTextContent("認証が必要です");
      expect(mockCreate).not.toHaveBeenCalled();
    },
  );
});
