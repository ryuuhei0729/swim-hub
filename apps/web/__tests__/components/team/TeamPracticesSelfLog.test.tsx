/**
 * TeamPractices 一般メンバー自己ログ導線 + Zustand ストア安全策テスト (Sprint Contract D4)
 *
 * D4: TeamPractices.tsx に「自分のログを追加」ボタンを追加し、PracticeTabModal
 * (initialTab=practiceLog) を開く。TeamPractices は共有 Zustand usePracticeStore を
 * 新規に触るため、mount/unmount で closeAll() する useLayoutEffect が必須
 * (過去に複数回 Critical 化した「他画面のモーダルが誤って開いたまま残る」バグの再発防止。
 * 手本 = practice/_client/PracticeClient.tsx:146-152 の既存実装)。
 *
 * Sprint Contract 検証観点:
 *   [V-D4P-01] 非admin(一般メンバー): 「自分のログを追加」ボタンが表示される
 *   [V-D4P-02] ボタン押下で usePracticeStore.isOpen が true になり、
 *              activeTab が "practiceLog" になる
 *   [V-D4P-03] 安全策: TeamPractices マウント時、他画面で開いたまま残っていた
 *              usePracticeStore の状態 (isOpen=true) が閉じられる (mount 時 closeAll)
 *   [V-D4P-04] 安全策: TeamPractices アンマウント時、usePracticeStore が閉じられる
 *              (unmount 時 closeAll。他画面へ遷移してもモーダルが残留しない)
 *   [V-D4P-05] admin でも「自分のログを追加」ボタンが表示される (admin/非admin問わず
 *              全メンバーの導線であることの確認。既存の管理者向け「練習記録追加」ボタンとは
 *              別ボタンであること = 2つの追加ボタンが共存する)
 *
 * 【jsdom 描画リスクに関するメモ】
 * PracticeTabModal 自体は重量コンポーネント (usePracticeTabSave 等) なので、本テストの
 * 関心事 (openTabModal の呼び出し / ストアの状態遷移) に絞るためモックする。
 * usePracticeStore は実物 (zustand シングルトン) を使う — 「他画面と共有される」こと自体が
 * 検証対象のため、モックすると意味がなくなる。
 */

import React from "react";
import { act } from "@testing-library/react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
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

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/components/forms/PracticeBasicForm", () => ({ default: () => null }));
vi.mock("@/components/forms/PracticeTabModal", () => ({ default: () => null }));
vi.mock("../../../components/team/TeamPracticeDetailModal", () => ({ default: () => null }));

function buildSupabaseMock() {
  const fromMock = vi.fn(() => ({
    select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) return { eq: () => Promise.resolve({ count: 0, error: null }) };
      return {
        eq: () => ({
          order: () => ({ range: () => Promise.resolve({ data: [], error: null }) }),
        }),
      };
    },
  }));
  return { from: fromMock };
}

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "member-1" }, supabase: buildSupabaseMock() }),
}));

import TeamPractices from "@/components/team/TeamPractices";

describe("TeamPractices — 自己ログ導線 + ストア安全策 (D4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 各テスト前に確実にクリーンな状態から開始する
    act(() => {
      usePracticeStore.getState().closeAll();
    });
  });

  it("[V-D4P-01] 非admin: 「自分のログを追加」ボタンが表示される", async () => {
    render(<TeamPractices teamId="team-1" isAdmin={false} />);
    await waitFor(() => {
      expect(usePracticeStore.getState()).toBeDefined();
    });

    expect(
      screen.getByRole("button", { name: /自分のログを追加|自分の練習を記録/ }),
    ).toBeInTheDocument();
  });

  it("[V-D4P-02] ボタン押下で isOpen=true / activeTab=practiceLog になる", async () => {
    const user = userEvent.setup();
    render(<TeamPractices teamId="team-1" isAdmin={false} />);

    await user.click(screen.getByRole("button", { name: /自分のログを追加|自分の練習を記録/ }));

    expect(usePracticeStore.getState().isOpen).toBe(true);
    expect(usePracticeStore.getState().activeTab).toBe("practiceLog");
  });

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
    await user.click(screen.getByRole("button", { name: /自分のログを追加|自分の練習を記録/ }));
    expect(usePracticeStore.getState().isOpen).toBe(true);

    unmount();

    expect(usePracticeStore.getState().isOpen).toBe(false);
  });

  it("[V-D4P-05] admin でも「自分のログを追加」ボタンが表示される (管理者用追加ボタンと共存)", async () => {
    render(<TeamPractices teamId="team-1" isAdmin={true} />);

    expect(
      screen.getByRole("button", { name: /自分のログを追加|自分の練習を記録/ }),
    ).toBeInTheDocument();
    // 既存の管理者向け「代理登録」ボタンも引き続き存在すること (2つのボタンが共存)
    expect(screen.getAllByRole("button").length).toBeGreaterThan(1);
  });
});
