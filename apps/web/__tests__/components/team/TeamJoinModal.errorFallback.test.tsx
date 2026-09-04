/**
 * TeamJoinModal — 参加失敗時のエラー表示 (情報露出防止の対テスト)
 *
 * 【前 QA 実測との齟齬について】
 * 今スプリントの Sprint Contract は TeamJoinModal を「文言未検証(既存テストあり)」の
 * 5ファイルの1つとして挙げていたが、実測 (find/grep) の結果、apps/web には
 * TeamJoinModal を実際にレンダーするテストが1件も存在しなかった
 * (`apps/web/__tests__/app/teams/teamsClientActionBar.test.tsx` はコンポーネントを
 * 一切レンダーしない方針のプレースホルダで、`TeamJoinModal` という文字列を含むのは
 * コメントのみ)。そのため本ファイルは「追記」ではなく新規ファイルとして作成する。
 *
 * TeamJoinModal.tsx の handleSubmit は Server Action `joinTeam` を呼び、
 * - `result.success === false` の場合は `throw new Error(result.error || ...)` (生の Error)
 * - `result.success === true` だが `membership.team_id` が無い場合は
 *   `throw new UserFacingError(t("joinModal.teamIdFailed"))`
 * のいずれも catch で `setError(toUserFacingMessage(err, t("joinModal.joinFailed")))` に集約される。
 * 生の Error は汎用フォールバックに潰され、UserFacingError はそのまま表示されることを対で検証する。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockJoinTeam } = vi.hoisted(() => ({ mockJoinTeam: vi.fn() }));

vi.mock("@/app/[locale]/(authenticated)/teams/_actions/actions", () => ({
  joinTeam: mockJoinTeam,
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

import TeamJoinModal from "@/components/team/TeamJoinModal";

describe("TeamJoinModal — 参加失敗時のエラー表示 — 情報露出防止の対テスト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const fillAndSubmit = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByTestId("team-join-code-input"), "INVITE123");
    await user.click(screen.getByTestId("team-join-submit-button"));
  };

  it(
    "[V-ERR-01] joinTeam が生の Error 相当 (result.error に生の詳細) で失敗した場合、" +
      "汎用フォールバック文言 (joinFailed) が表示され、生のエラー文字列は表示されない",
    async () => {
      const user = userEvent.setup();
      mockJoinTeam.mockResolvedValueOnce({
        success: false,
        error: 'relation "team_memberships" violates row-level security policy',
      });
      render(<TeamJoinModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

      await fillAndSubmit(user);

      const errorEl = await screen.findByTestId("team-join-error");
      expect(errorEl).toHaveTextContent("チームの参加に失敗しました");
      expect(errorEl).not.toHaveTextContent("row-level security policy");
      expect(screen.queryByText(/row-level security policy/)).not.toBeInTheDocument();
    },
  );

  it(
    "[V-ERR-02] joinTeam が成功したが team_id を取得できない (UserFacingError = " +
      "teamIdFailed) 場合、そのメッセージがそのまま表示される (対照実験)",
    async () => {
      const user = userEvent.setup();
      mockJoinTeam.mockResolvedValueOnce({
        success: true,
        membership: { id: "membership-1" }, // team_id が無い異常系
      });
      render(<TeamJoinModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

      await fillAndSubmit(user);

      const errorEl = await screen.findByTestId("team-join-error");
      expect(errorEl).toHaveTextContent("チームIDの取得に失敗しました");
    },
  );

  it("joinTeam が成功し team_id も取得できた場合はエラーが表示されず onSuccess/onClose が呼ばれる (対照)", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    mockJoinTeam.mockResolvedValueOnce({
      success: true,
      membership: { id: "membership-1", team_id: "team-1" },
    });
    render(<TeamJoinModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />);

    await fillAndSubmit(user);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith("team-1");
    });
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByTestId("team-join-error")).not.toBeInTheDocument();
  });
});
