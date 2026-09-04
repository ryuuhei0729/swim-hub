// =============================================================================
// useDayEntriesQuery.test.tsx - タップした日1日分のカレンダーエントリー取得フックのテスト
// =============================================================================
//
// Sprint Contract 検証観点:
//   [V-M-P06 / V-M-C01共通] 練習/大会記録の一覧行タップ時に開く DayDetailModal 用として、
//   タップした日「1日分」のみを取得すること (ダッシュボードの月単位 useCalendarQuery とは
//   別に、単発の日タップに対して月全体を取得しないための専用フック)。

import { createMockSupabaseClient } from "@/__mocks__/supabase";
import { DashboardAPI } from "@apps/shared/api/dashboard";
import type { CalendarItem } from "@apps/shared/types/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDayEntriesQuery } from "../useDayEntriesQuery";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useDayEntriesQuery", () => {
  let mockClient: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockSupabaseClient();
  });

  it("date が null の間はクエリを発行しない (enabled=false)", () => {
    const spy = vi.spyOn(DashboardAPI.prototype, "getCalendarEntries");

    const { result } = renderHook(() => useDayEntriesQuery(mockClient, null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(spy).not.toHaveBeenCalled();
  });

  it("date が指定されるとその日1日分 (startDate=endDate=当日) だけを取得する", async () => {
    const items: CalendarItem[] = [
      {
        id: "practice-1",
        type: "practice" as const,
        date: "2026-07-10",
        title: "朝練",
        place: "市民プール",
        metadata: {},
      },
    ];
    const spy = vi.spyOn(DashboardAPI.prototype, "getCalendarEntries").mockResolvedValue(items);

    const date = new Date("2026-07-10T00:00:00");
    const { result } = renderHook(() => useDayEntriesQuery(mockClient, date), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(items);
    expect(spy).toHaveBeenCalledTimes(1);
    const [startDate, endDate] = spy.mock.calls[0]!; // 直前の toHaveBeenCalledTimes(1) で存在は保証済み
    // 月全体ではなく、タップした日1日分のみをリクエストしていること
    expect(startDate).toBe(endDate);
    expect(startDate).toMatch(/2026-07-10/);
  });

  it("日付が変わるとクエリキーが変わり再取得される", async () => {
    const spy = vi.spyOn(DashboardAPI.prototype, "getCalendarEntries").mockResolvedValue([]);
    const wrapper = createWrapper();

    const { result, rerender } = renderHook(
      ({ date }: { date: Date | null }) => useDayEntriesQuery(mockClient, date),
      { wrapper, initialProps: { date: new Date("2026-07-10T00:00:00") } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledTimes(1);

    rerender({ date: new Date("2026-07-11T00:00:00") });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

    const secondCallArgs = spy.mock.calls[1]!; // 直前の toHaveBeenCalledTimes(2) で存在は保証済み
    expect(secondCallArgs[0]).toMatch(/2026-07-11/);
  });

  it("取得エラー時はエラー状態を返す", async () => {
    const error = new Error("取得失敗");
    vi.spyOn(DashboardAPI.prototype, "getCalendarEntries").mockRejectedValue(error);

    const { result } = renderHook(
      () => useDayEntriesQuery(mockClient, new Date("2026-07-10T00:00:00")),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
  });
});
