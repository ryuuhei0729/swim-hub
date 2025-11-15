import { useAuth } from '@/contexts'
import { DashboardAPI } from '@apps/shared/api/dashboard'
import type { CalendarItem } from '@apps/shared/types'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import { useCallback, useEffect, useMemo, useState } from 'react'

export interface MonthlySummary {
  practiceCount: number
  recordCount: number
  totalDistance?: number
  averageTime?: number
}

export function useCalendarData(displayDate: Date, _userId?: string) {
  const { supabase } = useAuth()
  const api = useMemo(() => new DashboardAPI(supabase), [supabase])
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([])
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary>({
    practiceCount: 0,
    recordCount: 0
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // 月の開始日と終了日を計算（displayDateを使用）
  const monthStart = startOfMonth(displayDate)
  const monthEnd = endOfMonth(displayDate)
  const startDate = format(monthStart, 'yyyy-MM-dd')
  const endDate = format(monthEnd, 'yyyy-MM-dd')

  // データ取得関数（useCallbackでメモ化）
  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // SupabaseクライアントとAPIインスタンスは既にメモ化済み

      // ユーザー認証チェック
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      // カレンダーエントリーと月間サマリーを並行取得
      const [entries, summary] = await Promise.all([
        api.getCalendarEntries(startDate, endDate),
        api.getMonthlySummary(displayDate.getFullYear(), displayDate.getMonth() + 1)
      ])
      setCalendarItems(entries)
      setMonthlySummary(summary)
    } catch (err) {
      console.error('Calendar data fetch error:', err)
      setError(err as Error)
      // エラー時も空配列を設定してUIを更新
      setCalendarItems([])
      setMonthlySummary({ practiceCount: 0, recordCount: 0 })
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, displayDate])

  // 初回データ取得
  useEffect(() => {
    loadData()
  }, [loadData])

  // リアルタイム購読は一時的に無効化（無限ループ回避）
  // useEffect(() => {
  //   const supabase = createClient()
  //   
  //   // 練習記録の変更を購読
  //   const practicesChannel = supabase
  //     .channel('dashboard-practices')
  //     .on(
  //       'postgres_changes',
  //       {
  //         event: '*',
  //         schema: 'public',
  //         table: 'practices'
  //       },
  //       () => {
  //         // 変更があったら再取得
  //         loadData()
  //       }
  //     )
  //     .subscribe()

  //   // 記録の変更を購読
  //   const recordsChannel = supabase
  //     .channel('dashboard-records')
  //     .on(
  //       'postgres_changes',
  //       {
  //         event: '*',
  //         schema: 'public',
  //         table: 'records'
  //       },
  //       () => {
  //         // 変更があったら再取得
  //         loadData()
  //       }
  //     )
  //     .subscribe()

  //   return () => {
  //     supabase.removeChannel(practicesChannel)
  //     supabase.removeChannel(recordsChannel)
  //   }
  // }, [loadData])

  return {
    calendarItems,
    monthlySummary,
    loading,
    error,
    refetch: loadData
  }
}

export default useCalendarData
