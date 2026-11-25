"use client";

// =============================================================================
// ダッシュボードのカレンダーの React Query フック (キーと取得関数は ./calendarKeys.ts)
// =============================================================================

import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { DashboardAPI } from "@apps/shared/api/dashboard";
import {
  CALENDAR_PREFETCH_STALE_MS,
  calendarKeys,
  calendarMonthQueryOptions,
  fetchCalendarMonth,
  getAdjacentCalendarMonthKeys,
} from "./calendarKeys";

/** 指定月のカレンダーデータを読む */
export function useCalendarMonthQuery(
  api: DashboardAPI,
  month: string,
  options: { alwaysRefetchOnMount?: boolean } = {},
) {
  const queryOptions = calendarMonthQueryOptions(api, month);
  return useQuery(
    options.alwaysRefetchOnMount ? { ...queryOptions, refetchOnMount: true } : queryOptions,
  );
}

/**
 * 前後の月を先読みする。オフラインのときは何もしない (失敗するだけなので)。
 * 先読みの失敗は prefetchQuery が握りつぶし、キャッシュには何も残らない。
 */
export function prefetchAdjacentCalendarMonths(
  queryClient: QueryClient,
  api: DashboardAPI,
  month: string,
): void {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const { prev, next } = getAdjacentCalendarMonthKeys(month);
  for (const adjacent of [prev, next]) {
    void queryClient.prefetchQuery({
      queryKey: calendarKeys.month(adjacent),
      queryFn: () => fetchCalendarMonth(api, adjacent),
      staleTime: CALENDAR_PREFETCH_STALE_MS,
      retry: false,
    });
  }
}
