/**
 * AnnouncementForm — 保存失敗時のエラー表示 (情報露出防止の対テスト)
 *
 * 対象は今スプリントの Sprint Contract で「テストが皆無」と分類された13ファイルの1つ。
 * handleSubmit の catch は
 * `setErrors({ endAt: toUserFacingMessage(error, tCommon("error")) })` で表示する
 * (表示先は endAt フィールドの下だが、実質的な保存エラー表示欄として使われている)。
 *
 * - [V-ERR-01] (生の Error): createAnnouncementMutation.mutateAsync が生の RLS エラーで
 *   失敗するケース。
 * - [V-ERR-02] (UserFacingError): 未認証 (`supabase.auth.getUser()` が user:null を返す)
 *   ケース。AnnouncementForm.tsx:129 `throw new UserFacingError(t("announcementForm.authRequired"))`
 *   という実際の組織的な UserFacingError 送出経路であり、合成ではない。
 */

import React from "react";
import { renderWithI18n as render, screen } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreateMutateAsync = vi.fn();
const mockUpdateMutateAsync = vi.fn();

vi.mock("@apps/shared/hooks/queries/announcements", () => ({
  useCreateTeamAnnouncementMutation: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  }),
  useUpdateTeamAnnouncementMutation: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
}));

let currentAuthMock: { supabase: { auth: { getUser: ReturnType<typeof vi.fn> } } };

vi.mock("@/contexts", () => ({
  useAuth: () => currentAuthMock,
}));

import { AnnouncementForm } from "@/components/team/AnnouncementForm";

describe("AnnouncementForm — 保存失敗時のエラー表示 — 情報露出防止の対テスト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const fillRequiredFields = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText(/タイトル/), "テストお知らせ");
    await user.type(screen.getByLabelText(/内容/), "テスト本文");
  };

  it(
    "[V-ERR-01] 作成 mutation が生の Error (RLSポリシー詳細等) で失敗した場合、" +
      "汎用フォールバック文言 (common.error) が表示され、生のエラー文字列は表示されない",
    async () => {
      const user = userEvent.setup();
      currentAuthMock = {
        supabase: {
          auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
        },
      };
      mockCreateMutateAsync.mockRejectedValueOnce(
        new Error('relation "team_announcements" violates row-level security policy'),
      );
      render(<AnnouncementForm isOpen={true} onClose={vi.fn()} teamId="team-1" />);

      await fillRequiredFields(user);
      await user.click(screen.getByRole("button", { name: "下書きとして保存" }));

      const message = await screen.findByText("エラーが発生しました");
      expect(message).toBeInTheDocument();
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
          auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
        },
      };
      render(<AnnouncementForm isOpen={true} onClose={vi.fn()} teamId="team-1" />);

      await fillRequiredFields(user);
      await user.click(screen.getByRole("button", { name: "下書きとして保存" }));

      expect(await screen.findByText("認証が必要です")).toBeInTheDocument();
      expect(mockCreateMutateAsync).not.toHaveBeenCalled();
    },
  );
});
