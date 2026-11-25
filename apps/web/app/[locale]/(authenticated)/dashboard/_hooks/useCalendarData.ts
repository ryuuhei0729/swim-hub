"use client";

import { useCallback, useMemo } from "react";
import { useAuth } from "@/contexts";
import { DashboardAPI } from "@apps/shared/api/dashboard";
import type { CalendarItem } from "@apps/shared/types";
import { toCalendarMonthKey } from "@/hooks/queries/calendarKeys";
import { useCalendarMonthQuery } from "@/hooks/queries/calendarQueries";

export interface MonthlySummary {
  practiceCount: number;
  recordCount: number;
  totalDistance?: number;
  averageTime?: number;
}

const EMPTY_CALENDAR_ITEMS: CalendarItem[] = [];
const DEFAULT_MONTHLY_SUMMARY: MonthlySummary = { practiceCount: 0, recordCount: 0 };

/**
 * 表示月のカレンダーデータ (エントリー + 月間サマリー) を読む。
 * 実体は CalendarProvider と同じ月キーの React Query (useCalendarMonthQuery) で、
 * キャッシュを共有する。データが無いときだけ loading / error にする。
 */
export function useCalendarData(displayDate: Date, _userId?: string) {
  const { supabase } = useAuth();
  const api = useMemo(() => new DashboardAPI(supabase), [supabase]);
  const query = useCalendarMonthQuery(api, toCalendarMonthKey(displayDate));
  const { refetch: queryRefetch } = query;

  const refetch = useCallback(async () => {
    await queryRefetch();
  }, [queryRefetch]);

  return {
    calendarItems: query.data?.calendarItems ?? EMPTY_CALENDAR_ITEMS,
    monthlySummary: (query.data?.monthlySummary as MonthlySummary | undefined) ?? DEFAULT_MONTHLY_SUMMARY,
    loading: !query.data && !query.error,
    error: !query.data && query.error ? query.error : null,
    refetch,
  };
}

export default useCalendarData;
