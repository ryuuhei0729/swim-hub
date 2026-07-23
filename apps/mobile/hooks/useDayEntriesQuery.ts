// =============================================================================
// 指定日のカレンダーエントリー取得用React Queryフック（モバイル版）
// =============================================================================
// 練習履歴・大会記録履歴タブから DayDetailModal を開く際、タップした行の日付
// 1日分のエントリーだけを取得する。ダッシュボードの useCalendarQuery（月単位）
// とは異なり、単発の日タップに対して月全体を取得しないための専用フック。

import { DashboardAPI } from "@apps/shared/api/dashboard";
import type { CalendarItem } from "@apps/shared/types/ui";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { toISODateString } from "@apps/shared/utils/date";
import { useMemo } from "react";

/**
 * 指定日1日分のカレンダーエントリーを取得する
 * date が null の間はクエリを発行しない
 */
export function useDayEntriesQuery(
  supabase: SupabaseClient,
  date: Date | null,
): UseQueryResult<CalendarItem[], Error> {
  const api = useMemo(() => new DashboardAPI(supabase), [supabase]);
  const dateKey = useMemo(() => (date ? toISODateString(date) : null), [date]);

  return useQuery({
    queryKey: ["calendar-day", dateKey],
    queryFn: async () => {
      if (!dateKey) return [];
      return await api.getCalendarEntries(dateKey, dateKey);
    },
    enabled: !!dateKey,
    staleTime: 60 * 1000,
  });
}
