// =============================================================================
// useCalendarQuery.test.ts - カレンダーデータ取得フックのユニットテスト
// =============================================================================

import { createMockSupabaseClient } from "@/__mocks__/supabase";
import { DashboardAPI } from "@apps/shared/api/dashboard";
import type { CalendarItem } from "@apps/shared/types/ui";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCalendarQuery } from "../useCalendarQuery";

// React Queryのテスト用ラッパー
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useCalendarQuery", () => {
  let mockClient: ReturnType<typeof createMockSupabaseClient>;
  let mockApi: DashboardAPI;

  beforeEach(() => {
    mockClient = createMockSupabaseClient();
    mockApi = new DashboardAPI(mockClient);
  });

  it("カレンダーエントリーを取得できる", async () => {
    const mockCalendarItems: CalendarItem[] = [
      {
        id: "item-1",
        type: "practice" as const,
        date: "2025-01-15",
        title: "テスト練習",
        place: "テストプール",
        metadata: {},
      },
    ];

    vi.spyOn(mockApi, "getCalendarEntries").mockResolvedValue(mockCalendarItems);

    const currentDate = new Date("2025-01-15");

    const { result } = renderHook(
      () => useCalendarQuery(mockClient, { currentDate, api: mockApi }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockCalendarItems);
    expect(mockApi.getCalendarEntries).toHaveBeenCalled();
  });

  it("指定された月の開始日・終了日でクエリを実行する", async () => {
    const mockCalendarItems: CalendarItem[] = [];
    vi.spyOn(mockApi, "getCalendarEntries").mockResolvedValue(mockCalendarItems);

    // UTCで日付を作成（タイムゾーンの影響を避ける）
    const currentDate = new Date(Date.UTC(2025, 0, 15)); // 月は0ベース（0=1月）

    const { result } = renderHook(
      () => useCalendarQuery(mockClient, { currentDate, api: mockApi }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // getCalendarEntriesが呼ばれたことを確認
    expect(mockApi.getCalendarEntries).toHaveBeenCalled();
    const callArgs = vi.mocked(mockApi.getCalendarEntries).mock.calls[0]!; // 直前の toHaveBeenCalled で呼び出しの存在は保証済み
    expect(callArgs).toHaveLength(2);
    // 開始日と終了日が文字列形式であることを確認
    expect(typeof callArgs[0]).toBe("string");
    expect(typeof callArgs[1]).toBe("string");
    // 見えている範囲全体 (日曜始まりの週で前月末・翌月初めを含む) を取る
    // 2025年1月は 2024-12-29(日) 〜 2025-02-01(土)
    expect(callArgs).toEqual(["2024-12-29", "2025-02-01"]);
  });

  it("APIが提供されていない場合、新しいAPIインスタンスを作成する", async () => {
    const mockCalendarItems: CalendarItem[] = [];
    const apiSpy = vi
      .spyOn(DashboardAPI.prototype, "getCalendarEntries")
      .mockResolvedValue(mockCalendarItems);

    const currentDate = new Date("2025-01-15");

    const { result } = renderHook(() => useCalendarQuery(mockClient, { currentDate }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiSpy).toHaveBeenCalled();
  });

  it("異なる月で異なるクエリキーが生成される", async () => {
    const mockCalendarItems: CalendarItem[] = [];
    vi.spyOn(mockApi, "getCalendarEntries").mockResolvedValue(mockCalendarItems);

    // UTCで日付を作成（タイムゾーンの影響を避ける）
    const januaryDate = new Date(Date.UTC(2025, 0, 15)); // 月は0ベース（0=1月）
    const februaryDate = new Date(Date.UTC(2025, 1, 15)); // 1=2月

    // 1月のクエリ
    const { result: janResult } = renderHook(
      () => useCalendarQuery(mockClient, { currentDate: januaryDate, api: mockApi }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(janResult.current.isSuccess).toBe(true));

    // モックをクリア
    vi.clearAllMocks();
    vi.spyOn(mockApi, "getCalendarEntries").mockResolvedValue(mockCalendarItems);

    // 2月のクエリ（別のフックインスタンス）
    const { result: febResult } = renderHook(
      () => useCalendarQuery(mockClient, { currentDate: februaryDate, api: mockApi }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(febResult.current.isSuccess).toBe(true));

    // 2月のクエリが実行されたことを確認
    expect(mockApi.getCalendarEntries).toHaveBeenCalled();
    const callArgs = vi.mocked(mockApi.getCalendarEntries).mock.calls[0]!; // 直前の toHaveBeenCalled で呼び出しの存在は保証済み
    // 2025年2月の見えている範囲は 2025-01-26(日) 〜 2025-03-01(土)
    expect(callArgs).toEqual(["2025-01-26", "2025-03-01"]);
  });

  it("エラーが発生した場合、エラー状態を返す", async () => {
    const error = new Error("カレンダー取得エラー");
    vi.spyOn(mockApi, "getCalendarEntries").mockRejectedValue(error);

    const currentDate = new Date("2025-01-15");

    const { result } = renderHook(
      () => useCalendarQuery(mockClient, { currentDate, api: mockApi }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);
  });

  // =========================================================================
  // チームイベント通過テスト (V-10: team_practice / team_competition が表示される)
  // =========================================================================

  it("team_practice アイテムがフィルタアウトされずに返される", async () => {
    const teamPracticeItems: CalendarItem[] = [
      {
        id: "tp-1",
        type: "team_practice" as const,
        date: "2025-01-15",
        title: "チーム練習",
        place: "メインプール",
        metadata: { team_id: "team-1" },
      },
    ];

    vi.spyOn(mockApi, "getCalendarEntries").mockResolvedValue(teamPracticeItems);

    const currentDate = new Date("2025-01-15");
    const { result } = renderHook(
      () => useCalendarQuery(mockClient, { currentDate, api: mockApi }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]!.type).toBe("team_practice"); // 直前の toHaveLength(1) で存在は保証済み
    expect(result.current.data?.[0]!.id).toBe("tp-1");
  });

  it("team_competition アイテムがフィルタアウトされずに返される", async () => {
    const teamCompetitionItems: CalendarItem[] = [
      {
        id: "tc-1",
        type: "team_competition" as const,
        date: "2025-01-20",
        title: "チーム大会",
        place: "大会会場",
        metadata: { team_id: "team-1" },
      },
    ];

    vi.spyOn(mockApi, "getCalendarEntries").mockResolvedValue(teamCompetitionItems);

    const currentDate = new Date("2025-01-15");
    const { result } = renderHook(
      () => useCalendarQuery(mockClient, { currentDate, api: mockApi }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]!.type).toBe("team_competition"); // 直前の toHaveLength(1) で存在は保証済み
    expect(result.current.data?.[0]!.id).toBe("tc-1");
  });

  it("複数の team_id を持つ team_practice が混在しても全て返される", async () => {
    const mixedTeamPractices: CalendarItem[] = [
      {
        id: "tp-team-a-1",
        type: "team_practice" as const,
        date: "2025-01-10",
        title: "チームA練習",
        place: "プールA",
        metadata: { team_id: "team-a" },
      },
      {
        id: "tp-team-b-1",
        type: "team_practice" as const,
        date: "2025-01-12",
        title: "チームB練習",
        place: "プールB",
        metadata: { team_id: "team-b" },
      },
      {
        id: "tp-team-a-2",
        type: "team_practice" as const,
        date: "2025-01-15",
        title: "チームA練習2",
        place: "プールA",
        metadata: { team_id: "team-a" },
      },
    ];

    vi.spyOn(mockApi, "getCalendarEntries").mockResolvedValue(mixedTeamPractices);

    const currentDate = new Date("2025-01-15");
    const { result } = renderHook(
      () => useCalendarQuery(mockClient, { currentDate, api: mockApi }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // 全3件が返されること（team_idによるフィルタアウトなし）
    expect(result.current.data).toHaveLength(3);
    const ids = result.current.data?.map((item) => item.id);
    expect(ids).toContain("tp-team-a-1");
    expect(ids).toContain("tp-team-b-1");
    expect(ids).toContain("tp-team-a-2");
  });

  it("個人練習とチーム練習が混在する場合、全て返される", async () => {
    const mixedItems: CalendarItem[] = [
      {
        id: "practice-1",
        type: "practice" as const,
        date: "2025-01-10",
        title: "個人練習",
        place: "個人プール",
        metadata: { user_id: "test-user-id" },
      },
      {
        id: "tp-1",
        type: "team_practice" as const,
        date: "2025-01-12",
        title: "チーム練習",
        place: "チームプール",
        metadata: { team_id: "team-1" },
      },
      {
        id: "tc-1",
        type: "team_competition" as const,
        date: "2025-01-20",
        title: "チーム大会",
        place: "大会会場",
        metadata: { team_id: "team-1" },
      },
    ];

    vi.spyOn(mockApi, "getCalendarEntries").mockResolvedValue(mixedItems);

    const currentDate = new Date("2025-01-15");
    const { result } = renderHook(
      () => useCalendarQuery(mockClient, { currentDate, api: mockApi }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(3);
    const types = result.current.data?.map((item) => item.type);
    expect(types).toContain("practice");
    expect(types).toContain("team_practice");
    expect(types).toContain("team_competition");
  });
  describe("前後の月の先読み", () => {
    afterEach(() => {
      onlineManager.setOnline(true);
    });

    it("表示中の月が取得できたら、前後の月も取得しておく", async () => {
      const spy = vi.spyOn(mockApi, "getCalendarEntries").mockResolvedValue([]);

      const { result } = renderHook(
        () => useCalendarQuery(mockClient, { currentDate: new Date(2025, 0, 15), api: mockApi }),
        { wrapper: createWrapper() },
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      await waitFor(() => expect(spy).toHaveBeenCalledTimes(3));
      const requestedMonths = spy.mock.calls.map(([startDate]) => startDate).sort();
      // 各月の見えている範囲の始まり (12月: 12/1(日)、1月: 12/29(日)、2月: 1/26(日))
      expect(requestedMonths).toEqual(["2024-12-01", "2024-12-29", "2025-01-26"]);
    });

    it("先読み済みの月へ切り替えたときは、取り直さずにすぐデータを返す", async () => {
      const spy = vi
        .spyOn(mockApi, "getCalendarEntries")
        .mockImplementation(async (startDate) => [
          { id: startDate, type: "practice", date: startDate, title: "", metadata: {} },
        ]);

      const { result, rerender } = renderHook(
        ({ currentDate }) => useCalendarQuery(mockClient, { currentDate, api: mockApi }),
        { wrapper: createWrapper(), initialProps: { currentDate: new Date(2025, 0, 15) } },
      );
      await waitFor(() => expect(spy).toHaveBeenCalledTimes(3));
      await waitFor(() => expect(result.current.data?.[0]?.id).toBe("2024-12-29"));
      const callsToFebruary = () =>
        spy.mock.calls.filter(([startDate]) => startDate === "2025-01-26").length;
      await waitFor(() => expect(callsToFebruary()).toBe(1));
      // 先読みの結果がキャッシュに入るのを待つ
      await new Promise((resolve) => setTimeout(resolve, 0));

      rerender({ currentDate: new Date(2025, 1, 1) });

      // 読み込み中を挟まず、切り替えた直後のレンダーで2月のデータが返る
      expect(result.current.isPending).toBe(false);
      expect(result.current.data?.[0]?.id).toBe("2025-01-26");
      expect(callsToFebruary()).toBe(1);
    });

    it("圏外では先読みしない", async () => {
      const spy = vi.spyOn(mockApi, "getCalendarEntries").mockResolvedValue([]);
      onlineManager.setOnline(false);

      const { result } = renderHook(
        () => useCalendarQuery(mockClient, { currentDate: new Date(2025, 0, 15), api: mockApi }),
        { wrapper: createWrapper() },
      );
      await waitFor(() => expect(result.current.fetchStatus).not.toBe("fetching"));
      await new Promise((resolve) => setTimeout(resolve, 20));

      const requestedMonths = spy.mock.calls.map(([startDate]) => startDate);
      expect(requestedMonths).not.toContain("2024-12-01");
      expect(requestedMonths).not.toContain("2025-01-26");
    });
  });
});
