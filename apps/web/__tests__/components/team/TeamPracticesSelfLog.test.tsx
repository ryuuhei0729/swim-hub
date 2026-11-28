/**
 * TeamPractices 一般メンバー自己ログ導線 + Zustand ストア安全策テスト (Sprint Contract D4)
 *
 * D4: TeamPractices.tsx の練習カードごとの「記録追加」ボタンから、その練習の ID を渡して
 * PracticeTabModal (initialTab=practiceLog) を開く。
 * swimhub-tasks#57: 以前は一覧上部の「自分のログを追加」1つだけで、練習の ID を渡さずに
 * 開いていたため、保存すると既存の練習にログが付かず team_id 付きの新しい練習が作られていた。
 * モバイルの TeamPracticeList (カードごとの「記録追加」) に合わせてヘッダーのボタンは廃止した。TeamPractices は共有 Zustand usePracticeStore を
 * 新規に触るため、mount/unmount で closeAll() する useLayoutEffect が必須
 * (過去に複数回 Critical 化した「他画面のモーダルが誤って開いたまま残る」バグの再発防止。
 * 手本 = practice/_client/PracticeClient.tsx:146-152 の既存実装)。
 *
 * Sprint Contract 検証観点:
 *   [V-D4P-01] 非admin(一般メンバー): 練習カードに「記録追加」ボタンが表示され、
 *              ヘッダーの「自分のログを追加」は無い
 *   [V-D4P-02] ボタン押下で usePracticeStore.isOpen が true になり、
 *              activeTab が "practiceLog"、editingPracticeId がその練習の ID になる
 *   [V-D4P-03] 安全策: TeamPractices マウント時、他画面で開いたまま残っていた
 *              usePracticeStore の状態 (isOpen=true) が閉じられる (mount 時 closeAll)
 *   [V-D4P-04] 安全策: TeamPractices アンマウント時、usePracticeStore が閉じられる
 *              (unmount 時 closeAll。他画面へ遷移してもモーダルが残留しない)
 *   [V-D4P-05] 管理者ビューのカードには「記録追加」を出さない (admin のログ入力は
 *              「記録代理入力」ボタンから一括入力へ進む。自分の分は利用者ビューで入力する。
 *              swimhub-tasks#112)
 *
 * 【jsdom 描画リスクに関するメモ】
 * PracticeTabModal 自体は重量コンポーネント (usePracticeTabSave 等) なので、本テストの
 * 関心事 (openTabModal の呼び出し / ストアの状態遷移) に絞るためモックする。
 * usePracticeStore は実物 (zustand シングルトン) を使う — 「他画面と共有される」こと自体が
 * 検証対象のため、モックすると意味がなくなる。
 */

import React from "react";
import { act } from "@testing-library/react";
import { renderWithI18n as render, screen, waitFor } from "@/__tests__/helpers/teamQueryTestUtils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePracticeStore } from "@/stores/practice/practiceStore";

vi.mock("@apps/shared/api/teams/practices", () => ({
  TeamPracticesAPI: vi.fn().mockImplementation(() => ({
    update: vi.fn(),
    remove: vi.fn(),
    create: vi.fn(),
  })),
}));

vi.mock("@/i18n/navigation");

vi.mock("@/components/forms/PracticeBasicForm", () => ({ default: () => null }));
vi.mock("@/components/forms/PracticeTabModal", () => ({
  default: (props: { editingPracticeId: string | null; logOwnerUserId?: string; allowParentUpdate?: boolean }) => (
    <div
      data-testid="practice-tab-modal"
      data-editing-practice-id={props.editingPracticeId ?? ""}
      data-log-owner-user-id={props.logOwnerUserId ?? ""}
      data-allow-parent-update={String(props.allowParentUpdate)}
    />
  ),
}));
vi.mock("../../../components/team/TeamPracticeDetailModal", () => ({ default: () => null }));

const PRACTICE_ROW = {
  id: "practice-1",
  user_id: "admin-1",
  date: "2026-11-20",
  title: "朝練",
  place: "市民プール",
  note: null,
  created_at: "2026-11-01T00:00:00Z",
  created_by: "admin-1",
  users: { name: "管理者" },
  created_by_user: { name: "管理者" },
  practice_logs: [],
};

function buildSupabaseMock() {
  const fromMock = vi.fn(() => ({
    select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) return { eq: () => Promise.resolve({ count: 1, error: null }) };
      return {
        eq: () => ({
          order: () => ({ range: () => Promise.resolve({ data: [PRACTICE_ROW], error: null }) }),
        }),
      };
    },
  }));
  return { from: fromMock };
}

const supabaseMock = buildSupabaseMock();

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "member-1" }, supabase: supabaseMock }),
}));

// 練習カードと操作は予定タブ (TeamSchedule) と同じ useTeamPracticeActions。一覧の取得はテスト用の描画側
import { TeamPractices } from "@/__tests__/utils/teamScheduleCardRenderers";

const findAddLogButton = () =>
  screen.findByRole("button", { name: /練習に自分の記録を追加/ });

describe("TeamPractices — 自己ログ導線 + ストア安全策 (D4)", () => {
  beforeEach(() => {
    // 各テスト前に確実にクリーンな状態から開始する
    act(() => {
      usePracticeStore.getState().closeAll();
    });
  });

  it("[V-D4P-01] 非admin: 練習カードに「記録追加」ボタンが表示され、ヘッダーの「自分のログを追加」は無い", async () => {
    render(<TeamPractices teamId="team-1" isAdmin={false} />);

    expect(await findAddLogButton()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /自分のログを追加/ })).toBeNull();
  });

  it(
    "[V-D4P-02] 「記録追加」を押すと、その練習の ID を渡して practiceLog タブで開く" +
      " (新しい練習を作らない。swimhub-tasks#57)",
    async () => {
      const user = userEvent.setup();
      render(<TeamPractices teamId="team-1" isAdmin={false} />);

      await user.click(await findAddLogButton());

      const state = usePracticeStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.activeTab).toBe("practiceLog");
      expect(state.editingPracticeId).toBe("practice-1");

      // 自分のログだけを読み込み、練習本体 (日付・場所など) は書き換えない
      const modal = await screen.findByTestId("practice-tab-modal");
      expect(modal).toHaveAttribute("data-editing-practice-id", "practice-1");
      expect(modal).toHaveAttribute("data-log-owner-user-id", "member-1");
      expect(modal).toHaveAttribute("data-allow-parent-update", "false");
    },
  );

  it(
    "[V-D4P-03] 安全策: 他画面で開いたまま残っていたストアの状態がマウント時に閉じられる",
    async () => {
      // 「他画面のダッシュボードでモーダルを開いたまま TeamPractices に遷移してきた」を再現
      act(() => {
        usePracticeStore.getState().openTabModal(new Date(), undefined, "practice");
      });
      expect(usePracticeStore.getState().isOpen).toBe(true);

      render(<TeamPractices teamId="team-1" isAdmin={false} />);

      await waitFor(() => {
        expect(usePracticeStore.getState().isOpen).toBe(false);
      });
    },
  );

  it("[V-D4P-04] 安全策: TeamPractices アンマウント時にストアが閉じられる", async () => {
    const { unmount } = render(<TeamPractices teamId="team-1" isAdmin={false} />);

    const user = userEvent.setup();
    await user.click(await findAddLogButton());
    expect(usePracticeStore.getState().isOpen).toBe(true);

    unmount();

    expect(usePracticeStore.getState().isOpen).toBe(false);
  });

  it("[V-D4P-05] admin のカードには「記録追加」を出さない (「記録代理入力」から一括入力へ進む)", async () => {
    render(<TeamPractices teamId="team-1" isAdmin={true} />);

    expect(
      await screen.findByRole("button", { name: "記録代理入力" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /練習に自分の記録を追加/ })).toBeNull();
  });
});
