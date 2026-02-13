'use client'

import { SupabaseClient } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { dashboardKeys } from './keys'

export interface DashboardStats {
  practiceCount: number
  recordCount: number
}

/**
 * ダッシュボード統計データ取得クエリ
 * 今月の練習回数と全期間の大会記録数を並列で取得
 */
export function useDashboardStatsQuery(
  supabase: SupabaseClient,
  userId: string | undefined
) {
  const today = new Date()
  const month = format(today, 'yyyy-MM')
  const startOfMonth = format(new Date(today.getFullYear(), today.getMonth(), 1), 'yyyy-MM-dd')
  const endOfMonth = format(new Date(today.getFullYear(), today.getMonth() + 1, 0), 'yyyy-MM-dd')

  return useQuery<DashboardStats>({
    queryKey: dashboardKeys.stats(userId ?? '', month),
    queryFn: async () => {
      const [practicesResult, recordsResult] = await Promise.all([
        supabase
          .from('practices')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId!)
          .gte('date', startOfMonth)
          .lte('date', endOfMonth),
        supabase
          .from('records')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId!),
      ])

      return {
        practiceCount: practicesResult.count ?? 0,
        recordCount: recordsResult.count ?? 0,
      }
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  })
}
