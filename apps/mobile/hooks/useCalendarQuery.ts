// =============================================================================
// カレンダーデータ取得用React Queryフック（モバイル版）
// =============================================================================

import { DashboardAPI } from "@apps/shared/api/dashboard";
import type { CalendarItem } from "@apps/shared/types/ui";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  onlineManager,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { addMonths, endOfMonth, startOfMonth } from "date-fns";
import { toISODateString } from "@apps/shared/utils/date";
import { useEffect, useMemo } from "react";

export interface UseCalendarQueryOptions {
  currentDate: Date;
  api?: DashboardAPI;
}

const CALENDAR_STALE_TIME = 5 * 60 * 1000; // 5分

/** 指定した日が属する月の、カレンダー取得クエリの設定 */
function calendarMonthQueryOptions(api: DashboardAPI, dateInMonth: Date) {
  const startDate = toISODateString(startOfMonth(dateInMonth));
  const endDate = toISODateString(endOfMonth(dateInMonth));
  return {
    queryKey: ["calendar", startDate, endDate] as const,
    queryFn: () => api.getCalendarEntries(startDate, endDate),
    staleTime: CALENDAR_STALE_TIME,
  };
}

/**
 * カレンダーデータ取得クエリ
 * 指定された月のカレンダーエントリーを取得
 *
 * 表示中の月が取得できたら、前後の月も先に取得しておく。月を送ったときに
 * 読み込みを待たずに表示できる (取得済みで新しければ何もしない)。
 */
export function useCalendarQuery(
  supabase: SupabaseClient,
  options: UseCalendarQueryOptions,
): UseQueryResult<CalendarItem[], Error> {
  const { currentDate, api: providedApi } = options;
  const queryClient = useQueryClient();

  const api = useMemo(() => providedApi ?? new DashboardAPI(supabase), [supabase, providedApi]);

  // 同じ月の中で日付だけが変わっても取り直さないよう、月初のタイムスタンプで表す
  const monthTime = startOfMonth(currentDate).getTime();
  const queryOptions = useMemo(
    () => calendarMonthQueryOptions(api, new Date(monthTime)),
    [api, monthTime],
  );

  const query = useQuery(queryOptions);

  // 表示中の月を優先するため、取得できてから前後の月を先読みする
  const hasCurrentMonth = query.data !== undefined;
  useEffect(() => {
    if (!hasCurrentMonth) return;
    // 圏外では失敗するだけなので先読みしない (電波が戻って月を送ったときに取得される)
    if (!onlineManager.isOnline()) return;
    const month = new Date(monthTime);
    for (const offset of [1, -1]) {
      // 失敗しても表示には影響しない (その月を開いたときに改めて取得される)
      void queryClient.prefetchQuery(calendarMonthQueryOptions(api, addMonths(month, offset)));
    }
  }, [hasCurrentMonth, monthTime, api, queryClient]);

  return query;
}
