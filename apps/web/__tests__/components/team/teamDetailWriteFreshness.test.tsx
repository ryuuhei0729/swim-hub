/**
 * チーム画面の React Query 化 — 保存・削除の直後に「保存前の内容」を出さない
 *
 *   [W-1] 2 ページ目で保存して 1 ページ目に戻したとき、キャッシュの古い 1 ページ目を
 *         表示せず、読み込み表示 → 最新の 1 ページ目 になる
 *   [W-2] 自分のログを保存したら、その練習の詳細モーダルのキャッシュも落とす
 *         (カードの「記録追加」から既存の練習に付ける。練習は新しく作らない)
 *   [W-3] 出欠タブの月別サマリは、ユーザーが確定するまで取得しない (読み込み表示のまま)
 *   [W-4] 月別サマリはクエリキーの基準月を起点に取得する
 */
import React from "react";
import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttendanceAPI } from "@swim-hub/shared/api/attendance";
import {
  createTestQueryClient,
  renderHookWithI18n,
  renderWithI18n as render,
  screen,
  waitFor,
} from "@/__tests__/helpers/teamQueryTestUtils";
import { teamDetailKeys } from "@/hooks/queries/teamDetailKeys";
import { myMonthListQueryOptions } from "@/hooks/queries/teamAttendanceQueries";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@apps/shared/api/teams/practices", () => ({
  TeamPracticesAPI: vi.fn().mockImplementation(function () {
    return { update: mocks.update, remove: mocks.remove, create: mocks.create };
  }),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));

// 基本フォーム: 開いたら「保存」ボタンだけ出す
vi.mock("@/components/forms/PracticeBasicForm", () => ({
  default: (props: {
    isOpen: boolean;
    onSubmit: (data: { date: string; title: string; place: string; note: string }) => void;
  }) =>
    props.isOpen ? (
      <button
        type="button"
        onClick={() =>
          props.onSubmit({ date: "2026-07-01", title: "更新後", place: "", note: "" })
        }
      >
        basic-submit
      </button>
    ) : null,
}));

// 練習ログタブモーダル: 開いたら onSave を呼ぶボタンだけ出す
vi.mock("@/components/forms/PracticeTabModal", () => ({
  default: (props: {
    isOpen: boolean;
    editingPracticeId: string | null;
    onSave: (params: unknown) => Promise<void>;
  }) =>
    props.isOpen ? (
      <button
        type="button"
        onClick={() =>
          void props.onSave({
            basicData: { date: "2026-07-01", title: "", place: "", note: "" },
            logs: [],
            originalLogIds: [],
            editingPracticeId: props.editingPracticeId,
          })
        }
      >
        self-log-submit
      </button>
    ) : null,
}));

// 保存処理本体は関心外。新規なら createPractice を呼び、最後に onSaved を呼ぶだけにする
vi.mock("@/hooks/usePracticeTabSave", () => ({
  usePracticeTabSave:
    (props: {
      createPractice: (p: unknown) => Promise<{ id: string }>;
      onSaved: () => void;
    }) =>
    async (params: { editingPracticeId: string | null }) => {
      if (!params.editingPracticeId) {
        await props.createPractice({ date: "2026-07-01", title: null, place: null, note: null });
      }
      props.onSaved();
    },
}));

vi.mock("../../../components/team/TeamPracticeDetailModal", () => ({ default: () => null }));

vi.mock("@/contexts/AuthProvider");
import { useAuth } from "@/contexts/AuthProvider";
import { buildAuthContext } from "@/__tests__/utils/authContext";

import TeamPractices from "@/components/team/TeamPractices";
import { useMonthList } from "@/components/team/monthly-attendance/hooks/useMonthList";

const PAGE_SIZE = 20;

const practiceRow = (id: string, title: string, date = "2026-07-20") => ({
  id,
  user_id: "member-1",
  date,
  title,
  place: null,
  note: null,
  created_at: "2026-07-20T00:00:00Z",
  created_by: "member-1",
  users: { name: "選手A" },
  created_by_user: null,
  practice_logs: [],
});

type Row = ReturnType<typeof practiceRow>;
type ListResult = { data: Row[] | null; error: unknown };

/** range(from, to) でページを切り出す一覧モック。`nextList` で次の取得を保留できる */
function buildPagedSupabaseMock(initialRows: Row[]) {
  const state = {
    rows: initialRows,
    nextList: null as null | ((from: number) => Promise<ListResult> | null),
  };
  const from = vi.fn(() => ({
    select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        return { eq: () => Promise.resolve({ count: state.rows.length, error: null }) };
      }
      return {
        eq: () => ({
          order: () => ({
            range: (start: number, end: number) => {
              const override = state.nextList?.(start);
              if (override) {
                state.nextList = null;
                return override;
              }
              return Promise.resolve({ data: state.rows.slice(start, end + 1), error: null });
            },
          }),
        }),
      };
    },
  }));
  return { supabase: { from }, state };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("TeamPractices — 保存後に保存前の内容を出さない", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({});
    mocks.remove.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({ id: "p-new" });
  });

  it("[W-1] 2 ページ目で保存して 1 ページ目に戻すと、古い 1 ページ目を出さずに最新を読み込む", async () => {
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, i) =>
      practiceRow(`p-${i + 1}`, `練習${i + 1}`),
    );
    const mock = buildPagedSupabaseMock(rows);
    vi.mocked(useAuth).mockReturnValue(
      buildAuthContext({ user: { id: "admin-1" }, supabase: mock.supabase }),
    );
    const queryClient = createTestQueryClient();
    const user = userEvent.setup();

    render(<TeamPractices teamId="team-1" isAdmin={true} />, { queryClient });
    expect(await screen.findByText("練習1")).toBeInTheDocument();

    // 2 ページ目へ (1 ページ目はキャッシュに残る)
    await user.click(screen.getByRole("button", { name: "ページ 2" }));
    expect(await screen.findByText("練習21")).toBeInTheDocument();
    expect(queryClient.getQueryData(teamDetailKeys.practicePage("team-1", 1, PAGE_SIZE))).toBeDefined();

    // 2 ページ目の練習を編集して保存。サーバー上では 1 ページ目の先頭が変わっている
    await user.click(screen.getAllByTestId("team-practice-edit-button")[0]!);
    mock.state.rows = [practiceRow("p-0", "保存後の練習"), ...rows];
    const page1 = deferred<ListResult>();
    mock.state.nextList = (start) => (start === 0 ? page1.promise : null);
    await user.click(await screen.findByText("basic-submit"));

    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    // 1 ページ目に戻ったが、再取得が終わるまで保存前の 1 ページ目は出ない
    await waitFor(() =>
      expect(
        queryClient.getQueryState(teamDetailKeys.practicePage("team-1", 1, PAGE_SIZE))
          ?.fetchStatus,
      ).toBe("fetching"),
    );
    expect(screen.queryByText("練習1")).not.toBeInTheDocument();
    expect(screen.queryByText("練習21")).not.toBeInTheDocument();

    await act(async () => {
      page1.resolve({ data: mock.state.rows.slice(0, PAGE_SIZE), error: null });
    });
    expect(await screen.findByText("保存後の練習")).toBeInTheDocument();
  });

  it("[W-1] 2 ページ目で削除すると、表示していない 1 ページ目のキャッシュは捨てる", async () => {
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, i) =>
      practiceRow(`p-${i + 1}`, `練習${i + 1}`),
    );
    const mock = buildPagedSupabaseMock(rows);
    vi.mocked(useAuth).mockReturnValue(
      buildAuthContext({ user: { id: "admin-1" }, supabase: mock.supabase }),
    );
    const queryClient = createTestQueryClient();
    const user = userEvent.setup();

    render(<TeamPractices teamId="team-1" isAdmin={true} />, { queryClient });
    expect(await screen.findByText("練習1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ページ 2" }));
    expect(await screen.findByText("練習21")).toBeInTheDocument();

    await user.click(screen.getAllByTestId("team-practice-delete-button")[0]!);
    mock.state.rows = rows.slice(0, PAGE_SIZE);
    await user.click(await screen.findByTestId("confirm-delete-button"));

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("p-21"));
    await waitFor(() =>
      expect(
        queryClient.getQueryData(teamDetailKeys.practicePage("team-1", 1, PAGE_SIZE)),
      ).toBeUndefined(),
    );
  });

  describe("[W-2] 自分のログの保存後に練習詳細モーダルのキャッシュを落とす", () => {
    async function renderAndSaveSelfLog() {
      const mock = buildPagedSupabaseMock([practiceRow("p-1", "朝練")]);
      vi.mocked(useAuth).mockReturnValue(
        buildAuthContext({ user: { id: "member-1" }, supabase: mock.supabase }),
      );
      const queryClient = createTestQueryClient();
      // 閉じている詳細モーダルに保存前のログが残っている
      queryClient.setQueryData(teamDetailKeys.practiceDetail("p-1"), { logs: ["保存前"] });
      queryClient.setQueryData(teamDetailKeys.practiceDetail("p-new"), { logs: ["保存前"] });
      const user = userEvent.setup();

      render(<TeamPractices teamId="team-1" isAdmin={false} />, { queryClient });
      expect(await screen.findByText("朝練")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /練習に自分の記録を追加/ }));
      await user.click(await screen.findByText("self-log-submit"));
      return queryClient;
    }

    it("カードの「記録追加」から保存すると、その練習の詳細を落とし、練習は新しく作らない", async () => {
      const queryClient = await renderAndSaveSelfLog();

      await waitFor(() =>
        expect(queryClient.getQueryData(teamDetailKeys.practiceDetail("p-1"))).toBeUndefined(),
      );
      expect(mocks.create).not.toHaveBeenCalled();
      // 関係ない練習の詳細は残す
      expect(queryClient.getQueryData(teamDetailKeys.practiceDetail("p-new"))).toBeDefined();
    });
  });
});

describe("出欠タブの月別サマリ", () => {
  /** fetchMyMonthList の 2 本 (練習・大会の日付) を模す。イベントが無いので月ごとの集計は走らない */
  function buildMonthListSupabaseMock() {
    const gte = vi.fn();
    const from = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          gte: (_col: string, value: string) => {
            gte(value);
            return { lte: () => Promise.resolve({ data: [], error: null }) };
          },
        }),
      }),
    }));
    return { supabase: { from } as unknown as SupabaseClient, from, gte };
  }

  const attendanceAPI = {
    getMyAttendancesByMonth: vi.fn(),
  } as unknown as AttendanceAPI;

  it("[W-3] ユーザーが確定するまで取得せず読み込み表示のまま、確定後に 1 回だけ取得する", async () => {
    const { supabase, from } = buildMonthListSupabaseMock();

    const { result, rerender } = renderHookWithI18n(
      ({ userId }: { userId: string | null }) =>
        useMonthList("team-1", supabase, attendanceAPI, userId),
      { initialProps: { userId: null as string | null } },
    );

    // AuthProvider の初期値 (user null) のあいだは取得しない
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(from).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
    // loadMonthList (refetch) も null では取得しない
    await act(async () => {
      await result.current.loadMonthList();
    });
    expect(from).not.toHaveBeenCalled();

    rerender({ userId: "user-1" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // 練習・大会の 2 本 = 1 回分の取得
    expect(from).toHaveBeenCalledTimes(2);
    expect(result.current.monthList).toEqual([]);
  });

  it("[W-4] クエリキーの基準月を起点に取得する", async () => {
    const { supabase, gte } = buildMonthListSupabaseMock();
    const options = myMonthListQueryOptions(supabase, "team-1", "user-1", "2027-03");

    expect(options.queryKey).toEqual(teamDetailKeys.myMonthList("team-1", "user-1", "2027-03"));
    await options.queryFn();
    expect(gte).toHaveBeenCalledWith("2027-03-01");
    expect(gte).toHaveBeenCalledTimes(2);
  });

  it("[W-3] userId が null のクエリオプションは無効 (enabled: false)", () => {
    const { supabase } = buildMonthListSupabaseMock();
    expect(myMonthListQueryOptions(supabase, "team-1", null).enabled).toBe(false);
    expect(myMonthListQueryOptions(supabase, "team-1", "user-1").enabled).toBe(true);
  });
});
