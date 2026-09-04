// =============================================================================
// useCalendarQuery.test.ts - カレンダーデータ取得フックのユニットテスト
// =============================================================================

import { createMockSupabaseClient } from "@/__mocks__/supabase";
import { DashboardAPI } from "@apps/shared/api/dashboard";
import type { CalendarItem } from "@apps/shared/types/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    vi.clearAllMocks();
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
    // 1月の日付が含まれることを確認（タイムゾーンの影響を考慮）
    expect(callArgs[0] + callArgs[1]).toMatch(/2025-01/);
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
    // 2月の日付が含まれることを確認（タイムゾーンの影響を考慮）
    const dateString = callArgs[0] + callArgs[1];
    expect(dateString).toMatch(/2025-02/);
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
});
