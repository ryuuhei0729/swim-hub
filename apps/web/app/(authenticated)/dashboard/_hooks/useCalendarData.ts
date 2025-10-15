import { createClient } from '@/lib/supabase'
import type { CalendarEntry } from '@apps/shared/api/dashboard'
import { DashboardAPI } from '@apps/shared/api/dashboard'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import { useEffect, useState } from 'react'

export interface MonthlySummary {
  practiceCount: number
  recordCount: number
  totalDistance?: number
  averageTime?: number
}

export function useCalendarData(currentDate: Date, _userId?: string) {
  const [calendarItems, setCalendarItems] = useState<CalendarEntry[]>([])
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary>({
    practiceCount: 0,
    recordCount: 0
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const supabase = createClient()
  const api = new DashboardAPI(supabase)

  // 月の開始日と終了日を計算
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const startDate = format(monthStart, 'yyyy-MM-dd')
  const endDate = format(monthEnd, 'yyyy-MM-dd')

  // データ取得関数
  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      // カレンダーエントリーと月間サマリーを並行取得
      const [entries, summary] = await Promise.all([
        api.getCalendarEntries(startDate, endDate),
        api.getMonthlySummary(currentDate.getFullYear(), currentDate.getMonth() + 1)
      ])

      setCalendarItems(entries)
      setMonthlySummary(summary)
    } catch (err) {
      console.error('Calendar data fetch error:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }

  // 初回データ取得
  useEffect(() => {
    loadData()
  }, [startDate, endDate, loadData])

  // リアルタイム購読（オプション）
  useEffect(() => {
    // 練習記録の変更を購読
    const practicesChannel = supabase
      .channel('dashboard-practices')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'practices'
        },
        () => {
          // 変更があったら再取得
          loadData()
        }
      )
      .subscribe()

    // 記録の変更を購読
    const recordsChannel = supabase
      .channel('dashboard-records')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'records'
        },
        () => {
          // 変更があったら再取得
          loadData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(practicesChannel)
      supabase.removeChannel(recordsChannel)
    }
  }, [startDate, endDate, supabase])

  return {
    calendarItems,
    monthlySummary,
    loading,
    error,
    refetch: () => {
      console.log('useCalendarData.refetch called')
      return loadData()
    }
  }
}

export default useCalendarData
