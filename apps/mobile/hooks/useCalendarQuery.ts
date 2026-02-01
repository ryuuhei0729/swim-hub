// =============================================================================
// カレンダーデータ取得用React Queryフック（モバイル版）
// =============================================================================

import { DashboardAPI } from '@apps/shared/api/dashboard'
import type { CalendarItem } from '@apps/shared/types/ui'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { endOfMonth, startOfMonth } from 'date-fns'
import { toISODateString } from '@apps/shared/utils/date'
import { useMemo } from 'react'

export interface UseCalendarQueryOptions {
  currentDate: Date
  api?: DashboardAPI
}

/**
 * カレンダーデータ取得クエリ
 * 指定された月のカレンダーエントリーを取得
 */
export function useCalendarQuery(
  supabase: SupabaseClient,
  options: UseCalendarQueryOptions
): UseQueryResult<CalendarItem[], Error> {
  const { currentDate, api: providedApi } = options

  const api = useMemo(
    () => providedApi ?? new DashboardAPI(supabase),
    [supabase, providedApi]
  )

  // 月の開始日・終了日を計算
  const monthStart = useMemo(() => startOfMonth(currentDate), [currentDate])
  const monthEnd = useMemo(() => endOfMonth(currentDate), [currentDate])

  const startDate = useMemo(
    () => toISODateString(monthStart),
    [monthStart]
  )
  const endDate = useMemo(
    () => toISODateString(monthEnd),
    [monthEnd]
  )

  return useQuery({
    queryKey: ['calendar', startDate, endDate],
    queryFn: async () => {
      return await api.getCalendarEntries(startDate, endDate)
    },
    staleTime: 5 * 60 * 1000, // 5分
  })
}
