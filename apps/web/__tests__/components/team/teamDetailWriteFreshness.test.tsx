/**
 * チーム画面の React Query 化 — 保存・削除の直後に「保存前の内容」を出さない
 *
 *   [W-1] 予定タブで「過去」を閉じてから保存・削除すると、表示していない過去の一覧の
 *         キャッシュは捨て、開き直したとき古い一覧を出さずに 読み込み表示 → 最新 になる
 *   [W-2] 自分のログを保存したら、その練習の詳細モーダルのキャッシュも落とす
 *         (カードの「記録追加」から既存の練習に付ける。練習は新しく作らない)
 *   [W-3] 出欠タブの自分の出欠一覧は、ユーザーが確定するまで取得しない (読み込み表示のまま)
 *   [W-4] 自分の出欠一覧はクエリキーの基準日を起点に取得する
 */
import React from "react";
import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
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

// 練習カードと操作は予定タブ (TeamSchedule) と同じ useTeamPracticeActions。一覧の取得はテスト用の描画側
import { TeamPractices } from "@/__tests__/utils/teamScheduleCardRenderers";
import { useMyAttendanceList } from "@/components/team/monthly-attendance/hooks/useMyAttendanceList";
import TeamSchedule from "@/components/team/TeamSchedule";
import { getScheduleToday } from "@/utils/teamSchedule";
import {
  buildScheduleSupabaseMock,
  practiceRow as schedulePracticeRow,
} from "@/__tests__/utils/teamScheduleSupabaseMock";

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

describe("TeamPractices — 保存後に保存前の内容を出さない", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({});
    mocks.remove.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({ id: "p-new" });
  });

  async function renderScheduleWithClosedPast() {
    const mock = buildScheduleSupabaseMock({
      practices: [
        schedulePracticeRow("p-up", "予定の練習", "2099-01-01"),
        schedulePracticeRow("p-past", "過去の練習", "2000-01-01"),
      ],
    });
    vi.mocked(useAuth).mockReturnValue(
      buildAuthContext({ user: { id: "admin-1" }, supabase: mock.supabase }),
    );
    const queryClient = createTestQueryClient();
    const user = userEvent.setup();
    const pastKey = teamDetailKeys.practicePast("team-1", getScheduleToday());

    render(<TeamSchedule teamId="team-1" isAdmin={true} />, { queryClient });
    expect(await screen.findByText("予定の練習")).toBeInTheDocument();
    // 「過去」を開いて閉じる (過去の一覧はキャッシュに残る)
    await user.click(screen.getByRole("switch", { name: "過去" }));
    expect(await screen.findByText("過去の練習")).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "過去" }));
    expect(await screen.findByText("予定の練習")).toBeInTheDocument();
    expect(queryClient.getQueryData(pastKey)).toBeDefined();
    return { mock, queryClient, user, pastKey };
  }

  it("[W-1] 保存すると、表示していない過去の一覧を捨て、開き直したとき最新を読み込む", async () => {
    const { mock, queryClient, user, pastKey } = await renderScheduleWithClosedPast();

    // 今日以降の練習を編集して保存。サーバー上では過去の練習も変わっている
    await user.click(screen.getAllByTestId("team-practice-edit-button")[0]!);
    mock.state.rows.practices = [
      schedulePracticeRow("p-up", "予定の練習", "2099-01-01"),
      schedulePracticeRow("p-past", "保存後の過去の練習", "2000-01-01"),
    ];
    await user.click(await screen.findByText("basic-submit"));

    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    await waitFor(() => expect(queryClient.getQueryData(pastKey)).toBeUndefined());

    // 開き直すと、保存前の過去の一覧は出さずに最新を読み込む
    await user.click(screen.getByRole("switch", { name: "過去" }));
    expect(screen.queryByText("過去の練習")).not.toBeInTheDocument();
    expect(await screen.findByText("保存後の過去の練習")).toBeInTheDocument();
  });

  it("[W-1] 削除すると、表示していない過去の一覧のキャッシュは捨てる", async () => {
    const { mock, queryClient, user, pastKey } = await renderScheduleWithClosedPast();

    await user.click(screen.getAllByTestId("team-practice-delete-button")[0]!);
    mock.state.rows.practices = [schedulePracticeRow("p-past", "過去の練習", "2000-01-01")];
    await user.click(await screen.findByTestId("confirm-delete-button"));

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("p-up"));
    await waitFor(() => expect(queryClient.getQueryData(pastKey)).toBeUndefined());
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

describe("出欠タブの自分の出欠一覧", () => {
  /** fetchMyAttendanceList の 2 本 (練習・大会) を模す。イベントが無いので出欠の取得は走らない */
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

  it("[W-3] ユーザーが確定するまで取得せず読み込み表示のまま、確定後に 1 回だけ取得する", async () => {
    const { supabase, from } = buildMonthListSupabaseMock();

    const { result, rerender } = renderHookWithI18n(
      ({ userId }: { userId: string | null }) =>
        useMyAttendanceList("team-1", supabase, userId),
      { initialProps: { userId: null as string | null } },
    );

    // AuthProvider の初期値 (user null) のあいだは取得しない
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(from).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);

    rerender({ userId: "user-1" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // 練習・大会の 2 本 = 1 回分の取得
    expect(from).toHaveBeenCalledTimes(2);
    expect(result.current.items).toEqual([]);
  });

  it("[W-4] クエリキーの基準日を起点に取得する (過去のイベントは取らない)", async () => {
    const { supabase, gte } = buildMonthListSupabaseMock();
    const options = myMonthListQueryOptions(supabase, "team-1", "user-1", "2027-03-15");

    expect(options.queryKey).toEqual(
      teamDetailKeys.myMonthList("team-1", "user-1", "2027-03-15"),
    );
    await options.queryFn();
    expect(gte).toHaveBeenCalledWith("2027-03-15");
    expect(gte).toHaveBeenCalledTimes(2);
  });

  it("[W-3] userId が null のクエリオプションは無効 (enabled: false)", () => {
    const { supabase } = buildMonthListSupabaseMock();
    expect(myMonthListQueryOptions(supabase, "team-1", null).enabled).toBe(false);
    expect(myMonthListQueryOptions(supabase, "team-1", "user-1").enabled).toBe(true);
  });
});
