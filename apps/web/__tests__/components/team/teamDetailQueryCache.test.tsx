/**
 * チーム画面の React Query 化 — キャッシュ表示・invalidate・タブ先読み
 *
 *   [C-1] 予定タブを開き直すと前回の一覧がすぐ表示され、裏で再取得して最新に差し替わる
 *         (以前と同じく開くたびに再取得する = staleTime 0)
 *   [C-2] 再取得が失敗しても、表示中の一覧を隠してエラーにしない
 *   [C-3] 削除 (ミューテーション) の後、一覧と影響するクエリが invalidate され、
 *         削除後の一覧に差し替わる
 *   [P-1] 先読み対象 = 既定タブ + 左右の隣 (先読みの仕組みがあるタブだけ)
 *   [P-2] 開いているタブの取得が終わってから先読みする
 *   [P-3] オフラインでは先読みしない
 */
import React from "react";
import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createTestQueryClient,
  renderHookWithI18n,
  renderWithI18n as render,
  screen,
  waitFor,
} from "@/__tests__/helpers/teamQueryTestUtils";
import { teamDetailKeys } from "@/hooks/queries/teamDetailKeys";

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@apps/shared/api/teams/practices", () => ({
  TeamPracticesAPI: vi.fn().mockImplementation(function () {
    return { update: vi.fn(), remove: mocks.remove, create: vi.fn() };
  }),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));

vi.mock("@/components/forms/PracticeBasicForm", () => ({ default: () => null }));
vi.mock("../../../components/team/TeamPracticeDetailModal", () => ({ default: () => null }));

vi.mock("@/contexts/AuthProvider");
import { useAuth } from "@/contexts/AuthProvider";
import { buildAuthContext } from "@/__tests__/utils/authContext";

import TeamSchedule from "@/components/team/TeamSchedule";
import {
  getTeamTabsToPrefetch,
  TEAM_TAB_PREFETCH_DELAY_MS,
  useTeamTabPrefetch,
} from "@/hooks/queries/useTeamTabPrefetch";
import { getScheduleToday } from "@/utils/teamSchedule";
import {
  buildScheduleSupabaseMock,
  practiceRow,
  type ScheduleListResult,
} from "@/__tests__/utils/teamScheduleSupabaseMock";

// 今日以降の一覧に出るよう、十分先の日付にする
const FUTURE = "2099-07-20";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("TeamSchedule — タブを開き直したときのキャッシュ表示", () => {
  let mock: ReturnType<typeof buildScheduleSupabaseMock>;

  beforeEach(() => {
    mock = buildScheduleSupabaseMock({});
    vi.mocked(useAuth).mockReturnValue(
      buildAuthContext({ user: { id: "admin-1" }, supabase: mock.supabase }),
    );
    mocks.remove.mockResolvedValue(undefined);
  });

  const practiceListCalls = () =>
    mock.state.calls.filter((call) => call.table === "practices" && call.when === "upcoming")
      .length;

  it("[C-1] 開き直すと前回の一覧を即表示し、再取得の完了後に最新へ差し替える", async () => {
    mock.state.rows.practices = [practiceRow("p-1", "朝練", FUTURE)];
    const queryClient = createTestQueryClient();

    const first = render(<TeamSchedule teamId="team-1" isAdmin={false} />, { queryClient });
    expect(await screen.findByText("朝練")).toBeInTheDocument();
    first.unmount();

    // 別タブを見ている間にデータが変わった。次の取得はテストが解決するまで保留する
    mock.state.rows.practices = [practiceRow("p-2", "夕練", FUTURE)];
    const pending = deferred<ScheduleListResult>();
    mock.state.nextList = (call) => (call.table === "practices" ? pending.promise : null);
    const callsBefore = practiceListCalls();

    render(<TeamSchedule teamId="team-1" isAdmin={false} />, { queryClient });

    // 前回の一覧が (読み込み表示を挟まず) すぐ出ている
    expect(screen.getByText("朝練")).toBeInTheDocument();
    // 以前と同じく、開くたびに再取得している
    await waitFor(() => expect(practiceListCalls()).toBe(callsBefore + 1));

    await act(async () => {
      pending.resolve({ data: mock.state.rows.practices, error: null });
    });
    expect(await screen.findByText("夕練")).toBeInTheDocument();
    expect(screen.queryByText("朝練")).not.toBeInTheDocument();
  });

  it("[C-2] 再取得が失敗しても表示中の一覧を残し、エラー表示に切り替えない", async () => {
    mock.state.rows.practices = [practiceRow("p-1", "朝練", FUTURE)];
    const queryClient = createTestQueryClient();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const first = render(<TeamSchedule teamId="team-1" isAdmin={false} />, { queryClient });
    expect(await screen.findByText("朝練")).toBeInTheDocument();
    first.unmount();

    mock.state.nextList = (call) =>
      call.table === "practices"
        ? Promise.resolve({ data: null, error: new Error("network") })
        : null;
    render(<TeamSchedule teamId="team-1" isAdmin={false} />, { queryClient });

    await waitFor(() =>
      expect(
        queryClient.getQueryState(
          teamDetailKeys.practiceUpcoming("team-1", getScheduleToday()),
        )?.status,
      ).toBe("error"),
    );
    expect(screen.getByText("朝練")).toBeInTheDocument();
    expect(screen.queryByText("予定の取得に失敗しました")).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it("[C-3] 削除後は練習一覧・出欠サマリ・練習詳細を invalidate し、削除後の一覧に差し替える", async () => {
    mock.state.rows.practices = [
      practiceRow("p-1", "朝練", FUTURE),
      practiceRow("p-2", "夕練", "2099-07-21"),
    ];
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const user = userEvent.setup();

    render(<TeamSchedule teamId="team-1" isAdmin={true} />, { queryClient });
    expect(await screen.findByText("朝練")).toBeInTheDocument();

    const deleteButtons = await screen.findAllByTestId("team-practice-delete-button");
    await user.click(deleteButtons[0]!);
    // サーバー上で削除された状態を返す
    mock.state.rows.practices = [practiceRow("p-2", "夕練", "2099-07-21")];
    await user.click(await screen.findByTestId("confirm-delete-button"));

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("p-1"));
    const invalidatedKeys = invalidateSpy.mock.calls.map(([filters]) => filters?.queryKey);
    expect(invalidatedKeys).toContainEqual(teamDetailKeys.practicePages("team-1"));
    expect(invalidatedKeys).toContainEqual(teamDetailKeys.myMonthListAll("team-1"));
    expect(invalidatedKeys).toContainEqual(teamDetailKeys.practiceDetail("p-1"));

    await waitFor(() => expect(screen.queryByText("朝練")).not.toBeInTheDocument());
    expect(screen.getByText("夕練")).toBeInTheDocument();
  });
});

describe("チーム画面のタブ先読み", () => {
  it("[P-1] 既定タブ + 左右の隣を先読み対象にする (仕組みの無いタブ・自分自身は除く)", () => {
    // タブの並び (両ビュー共通): members, schedule, attendance, others。既定タブは members
    expect(getTeamTabsToPrefetch("member", "members")).toEqual(["schedule"]);
    expect(getTeamTabsToPrefetch("member", "schedule")).toEqual(["members", "attendance"]);
    // その他 (カードだけ) の隣は出欠
    expect(getTeamTabsToPrefetch("member", "others")).toEqual(["members", "attendance"]);
    // 管理者ビュー: 出欠は編集フォームなので先読みしない。その他も先読みの仕組みが無い
    expect(getTeamTabsToPrefetch("admin", "members")).toEqual(["schedule"]);
    expect(getTeamTabsToPrefetch("admin", "others")).toEqual(["members"]);
  });

  describe("useTeamTabPrefetch", () => {
    const supabase = { from: vi.fn() };
    const originalOnLine = Object.getOwnPropertyDescriptor(window.navigator, "onLine");

    beforeEach(() => {
      vi.useFakeTimers();
      vi.mocked(useAuth).mockReturnValue(buildAuthContext({ user: { id: "user-1" }, supabase }));
    });

    afterEach(() => {
      vi.useRealTimers();
      if (originalOnLine) {
        Object.defineProperty(window.navigator, "onLine", originalOnLine);
      } else {
        // jsdom は prototype 側に定義しているので、上書きした自前プロパティを消す
        delete (window.navigator as { onLine?: boolean }).onLine;
      }
    });

    const practicesKey = () => teamDetailKeys.practiceUpcoming("team-1", getScheduleToday());

    it("[P-2] 開いているタブ (予定) の取得が終わるまで待ち、その後で隣と既定タブを先読みする", async () => {
      const queryClient = createTestQueryClient();
      const prefetchSpy = vi.spyOn(queryClient, "prefetchQuery").mockResolvedValue(undefined);

      renderHookWithI18n(() => useTeamTabPrefetch("team-1", "schedule", "member"), {
        queryClient,
      });

      // 予定タブの一覧がまだ無いあいだは先読みしない
      await act(async () => {
        vi.advanceTimersByTime(TEAM_TAB_PREFETCH_DELAY_MS * 4);
      });
      expect(prefetchSpy).not.toHaveBeenCalled();

      // 予定タブの一覧 (今日以降の練習) が取れた
      await act(async () => {
        queryClient.setQueryData(practicesKey(), []);
      });
      await act(async () => {
        vi.advanceTimersByTime(TEAM_TAB_PREFETCH_DELAY_MS);
      });

      const prefetchedKeys = prefetchSpy.mock.calls.map(([options]) => options.queryKey);
      // 既定タブ = 左隣 (メンバー一覧)
      expect(prefetchedKeys).toContainEqual(teamDetailKeys.approvedMembers("team-1"));
      // 右隣 (出欠の月別サマリ)
      expect(prefetchedKeys).toContainEqual(
        expect.arrayContaining([...teamDetailKeys.myMonthListAll("team-1"), "user-1"]),
      );
      // 開いているタブ自身と、重いベストタイム表は先読みしない
      expect(prefetchedKeys).not.toContainEqual(practicesKey());
      expect(
        prefetchedKeys.some((key) => (key as readonly unknown[])[0] === "teamMemberBestTimes"),
      ).toBe(false);
    });

    it("[P-3] オフライン (navigator.onLine === false) では先読みしない", async () => {
      Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
      const queryClient = createTestQueryClient();
      const prefetchSpy = vi.spyOn(queryClient, "prefetchQuery").mockResolvedValue(undefined);
      queryClient.setQueryData(practicesKey(), []);

      renderHookWithI18n(() => useTeamTabPrefetch("team-1", "schedule", "member"), {
        queryClient,
      });
      await act(async () => {
        vi.advanceTimersByTime(TEAM_TAB_PREFETCH_DELAY_MS * 2);
      });

      expect(prefetchSpy).not.toHaveBeenCalled();
    });
  });
});
