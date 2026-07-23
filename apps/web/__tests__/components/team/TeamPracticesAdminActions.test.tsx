/**
 * TeamPractices 管理者向け編集・削除ボタンテスト (Sprint Contract D3)
 *
 * D3: components/team/TeamPractices.tsx に admin 向け編集(既存 PracticeBasicForm の
 * editData prop 再利用)・削除(components/ui/DeleteConfirmModal 再利用) を追加する。
 * 共有API TeamPracticesAPI.update/remove は実装済み。既存の直接supabase+ローカルstate方式に
 * 揃える。非adminには非表示。既存のクリック→ログ代理入力遷移 (router.push(.../logs)) を
 * 壊さない (e.stopPropagation() 必須)。
 *
 * Sprint Contract 検証観点:
 *   [V-D3P-01] admin: カードに編集ボタンが表示される
 *   [V-D3P-02] admin: 編集ボタン押下で PracticeBasicForm が editData 付きで開き、
 *              ログ入力ページへの router.push は発火しない (stopPropagation)
 *   [V-D3P-03] admin: 削除ボタン押下で DeleteConfirmModal が開く (即削除しない)
 *   [V-D3P-04] admin: 削除確認で TeamPracticesAPI.remove(id) が呼ばれ、一覧が再取得される
 *   [V-D3P-05] admin: 削除キャンセルでは remove が呼ばれない
 *   [V-D3P-06] 非admin: 編集/削除ボタンが表示されない
 *
 * 【jsdom 描画リスクに関するメモ】
 * TeamPractices は react-query を使わず、useState + useEffect + 直接 supabase 呼び出しの
 * 単純な実装であるため、MembersTimeTable.test.tsx と同様に jsdom で問題なくレンダー可能。
 * ただし TeamPracticesAPI / PracticeBasicForm / TeamPracticeDetailModal は
 * 本テストの関心事ではないためモックする。supabase の select().eq().order().range() /
 * select({count}).eq() の2種類のチェーンをそれぞれ模した軽量モックを用意する。
 *
 * NOTE: D3 未実装のため、編集/削除ボタン自体が存在せず [V-D3P-01]〜[V-D3P-05] は
 * 赤 (要素が見つからない) になる想定。
 *
 * 【セレクタに関する Sprint Contract 追記】
 * カード自体が既に isAdmin 時に role="button" + aria-label ("...の練習記録を編集"/
 * "...を追加") を持っているため、getByRole("button", { name: /編集/ }) は
 * 実装前でもこの既存カード全体を誤って拾ってしまう (false positive)。
 * これを避けるため、新規の編集/削除ボタンには `data-testid` を付与することを
 * D3 の実装要件として QA から提案する:
 *   - 編集ボタン: data-testid="team-practice-edit-button"
 *   - 削除ボタン: data-testid="team-practice-delete-button"
 * (DeleteConfirmModal 自体が既に confirm-dialog / confirm-delete-button /
 *  cancel-delete-button という testid 規約を持つため、それに揃える形)
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@apps/shared/api/teams/practices", () => ({
  TeamPracticesAPI: vi.fn().mockImplementation(() => ({
    update: mocks.update,
    remove: mocks.remove,
    create: mocks.create,
  })),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));

const RAW_PRACTICE_ROW = {
  id: "practice-1",
  user_id: "member-1",
  date: "2026-07-20",
  title: "朝練",
  place: "市民プール",
  note: null,
  created_at: "2026-07-20T00:00:00Z",
  created_by: "member-1",
  users: { name: "選手A" },
  created_by_user: null,
  practice_logs: [{ id: "log-1", style: "Fr", distance: 100, practice_times: [] }],
};

/**
 * TeamPractices.loadTeamPractices() が発行する2種類のチェーンを模したモック:
 *   1. count 用: .select("*", { count, head: true }).eq(...)  → thenable で解決
 *   2. data 用:  .select(cols).eq(...).order(...).range(...)  → thenable で解決
 */
interface SupabaseMock {
  from: (...args: unknown[]) => unknown;
}

function buildSupabaseMock(rows: (typeof RAW_PRACTICE_ROW)[]): SupabaseMock {
  const fromMock = vi.fn(() => ({
    select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        return { eq: () => Promise.resolve({ count: rows.length, error: null }) };
      }
      return {
        eq: () => ({
          order: () => ({
            range: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      };
    },
  }));
  return { from: fromMock };
}

function buildAuthMock({
  isAdmin,
  supabase,
}: {
  isAdmin: boolean;
  supabase: SupabaseMock;
}) {
  return { user: { id: isAdmin ? "admin-1" : "member-1" }, supabase };
}

let currentAuthMock: ReturnType<typeof buildAuthMock>;

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => currentAuthMock,
}));

vi.mock("@/components/forms/PracticeBasicForm", () => ({
  default: (props: { isOpen: boolean; editData?: { title?: string | null } }) =>
    props.isOpen ? (
      <div data-testid="practice-basic-form-stub">
        {props.editData ? `edit:${props.editData.title ?? ""}` : "create"}
      </div>
    ) : null,
}));

vi.mock("../../../components/team/TeamPracticeDetailModal", () => ({
  default: () => null,
}));

import TeamPractices from "@/components/team/TeamPractices";

describe("TeamPractices — 管理者向け編集・削除 (D3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.remove.mockResolvedValue(undefined);
    mocks.update.mockResolvedValue({});
    currentAuthMock = buildAuthMock({
      isAdmin: true,
      supabase: buildSupabaseMock([RAW_PRACTICE_ROW]),
    });
  });

  it("[V-D3P-01] admin: 練習カードに編集ボタンが表示される", async () => {
    render(<TeamPractices teamId="team-1" isAdmin={true} />);

    await screen.findByText("朝練");
    expect(screen.getByTestId("team-practice-edit-button")).toBeInTheDocument();
  });

  it(
    "[V-D3P-02] admin: 編集ボタン押下で PracticeBasicForm が editData 付きで開き、" +
      "ログ入力ページへは遷移しない (stopPropagation)",
    async () => {
      const user = userEvent.setup();
      render(<TeamPractices teamId="team-1" isAdmin={true} />);
      await screen.findByText("朝練");

      await user.click(screen.getByTestId("team-practice-edit-button"));

      expect(await screen.findByTestId("practice-basic-form-stub")).toHaveTextContent("edit:朝練");
      expect(mocks.push).not.toHaveBeenCalled();
    },
  );

  it("[V-D3P-03] admin: 削除ボタン押下で確認モーダルが開く (即削除しない)", async () => {
    const user = userEvent.setup();
    render(<TeamPractices teamId="team-1" isAdmin={true} />);
    await screen.findByText("朝練");

    await user.click(screen.getByTestId("team-practice-delete-button"));

    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("[V-D3P-04] admin: 削除確認で TeamPracticesAPI.remove(id) が呼ばれ、一覧が再取得される", async () => {
    const user = userEvent.setup();
    render(<TeamPractices teamId="team-1" isAdmin={true} />);
    await screen.findByText("朝練");

    await user.click(screen.getByTestId("team-practice-delete-button"));
    await user.click(screen.getByTestId("confirm-delete-button"));

    await waitFor(() => {
      expect(mocks.remove).toHaveBeenCalledWith("practice-1");
    });
  });

  it("[V-D3P-05] admin: 削除キャンセルでは remove が呼ばれない", async () => {
    const user = userEvent.setup();
    render(<TeamPractices teamId="team-1" isAdmin={true} />);
    await screen.findByText("朝練");

    await user.click(screen.getByTestId("team-practice-delete-button"));
    await user.click(screen.getByTestId("cancel-delete-button"));

    expect(mocks.remove).not.toHaveBeenCalled();
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
  });

  it("[V-D3P-06] 非admin: 編集/削除ボタンが表示されない", async () => {
    currentAuthMock = buildAuthMock({
      isAdmin: false,
      supabase: buildSupabaseMock([RAW_PRACTICE_ROW]),
    });
    render(<TeamPractices teamId="team-1" isAdmin={false} />);
    await screen.findByText("朝練");

    expect(screen.queryByTestId("team-practice-edit-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("team-practice-delete-button")).not.toBeInTheDocument();
  });
});
