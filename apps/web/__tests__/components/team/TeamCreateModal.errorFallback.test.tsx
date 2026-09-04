/**
 * TeamCreateModal — 保存失敗時のエラー表示 (情報露出防止の対テスト)
 *
 * 【前 QA 実測との齟齬について】
 * 今スプリントの Sprint Contract は TeamCreateModal を「文言未検証(既存テストあり)」の
 * 5ファイルの1つとして挙げていたが、実測 (find/grep) の結果、apps/web には
 * TeamCreateModal を実際にレンダーするテストが1件も存在しなかった
 * (`apps/web/__tests__/app/teams/teamsClientActionBar.test.tsx` はコンポーネントを
 * 一切レンダーしない方針のプレースホルダで、`TeamCreateModal` という文字列を含むのは
 * コメントのみ)。そのため本ファイルは「追記」ではなく新規ファイルとして作成する。
 *
 * TeamCreateModal.tsx の catch は
 * `setError(toUserFacingMessage(err, t("createModal.createFailed")))` で失敗を通知する。
 * 生の Error (RLSポリシー詳細等) と UserFacingError (i18n 済みメッセージ) を対で注入し、
 * 前者は汎用フォールバックに潰され、後者はそのまま表示されることを検証する。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserFacingError } from "@swim-hub/shared/utils/userFacingError";

const mockCreateTeamMutateAsync = vi.fn();

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useCreateTeamMutation: () => ({
    mutateAsync: mockCreateTeamMutateAsync,
    isPending: false,
  }),
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, supabase: {} }),
}));

import TeamCreateModal from "@/components/team/TeamCreateModal";

describe("TeamCreateModal — 保存失敗時のエラー表示 — 情報露出防止の対テスト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const fillAndSubmit = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByTestId("team-name-input"), "テストチーム");
    await user.click(screen.getByTestId("team-create-submit-button"));
  };

  it(
    "[V-ERR-01] チーム作成が生の Error (RLSポリシー詳細等) で失敗した場合、" +
      "汎用フォールバック文言 (createFailed) が表示され、生のエラー文字列は表示されない",
    async () => {
      const user = userEvent.setup();
      mockCreateTeamMutateAsync.mockRejectedValueOnce(
        new Error('relation "teams" violates row-level security policy'),
      );
      render(<TeamCreateModal isOpen={true} onClose={vi.fn()} />);

      await fillAndSubmit(user);

      const message = await screen.findByText("チームの作成に失敗しました");
      expect(message).toBeInTheDocument();
      expect(screen.queryByText(/row-level security policy/)).not.toBeInTheDocument();
    },
  );

  it(
    "[V-ERR-02] チーム作成が UserFacingError (i18n 済みメッセージ) で失敗した場合、" +
      "そのメッセージがそのまま表示される (対照実験)",
    async () => {
      const user = userEvent.setup();
      mockCreateTeamMutateAsync.mockRejectedValueOnce(
        new UserFacingError("テスト用の翻訳済みメッセージ"),
      );
      render(<TeamCreateModal isOpen={true} onClose={vi.fn()} />);

      await fillAndSubmit(user);

      expect(await screen.findByText("テスト用の翻訳済みメッセージ")).toBeInTheDocument();
    },
  );

  it("チーム作成に成功するとエラーは表示されず onSuccess/onClose が呼ばれる (対照)", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    mockCreateTeamMutateAsync.mockResolvedValueOnce({ id: "team-new" });
    render(<TeamCreateModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />);

    await fillAndSubmit(user);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith("team-new");
    });
    expect(onClose).toHaveBeenCalled();
  });
});
