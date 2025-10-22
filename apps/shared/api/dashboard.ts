// =============================================================================
// ダッシュボードAPI - Swim Hub共通パッケージ
// カレンダーデータ取得など
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { CalendarItem } from '../types/ui'

export class DashboardAPI {
  constructor(private supabase: SupabaseClient) {}

  /**
   * カレンダーエントリー取得（月間） - 最適化版
   */
  async getCalendarEntries(
    startDate: string,
    endDate: string
  ): Promise<CalendarItem[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')


    // カレンダービューから一括取得
    const { data: calendarData, error } = await this.supabase
      .from('calendar_view')
      .select('*')
      .gte('item_date', startDate)
      .lte('item_date', endDate)
      .order('item_date', { ascending: false })

    if (error) throw error

    // データをCalendarItem形式に変換
    const result = calendarData?.map(item => ({
      id: item.id,
      type: item.item_type as any,
      date: item.item_date,
      title: item.title,
      location: item.location,
      note: item.note,
      metadata: item.metadata || {},
      editData: {
        id: item.id,
        date: item.item_date,
        ...(item.metadata || {})
      }
    })) || []

    return result
  }

  /**
   * 月間サマリー取得
   */
  async getMonthlySummary(year: number, month: number) {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // 月の開始日と終了日を正確に計算
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0) // 月の最後の日を取得
    
    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    // 練習回数
    const { count: practiceCount } = await this.supabase
      .from('practices')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('date', startDateStr)
      .lte('date', endDateStr)

    // 記録数
    const { count: recordCount } = await this.supabase
      .from('records')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', startDateStr)
      .lte('created_at', endDateStr)

    return {
      practiceCount: practiceCount || 0,
      recordCount: recordCount || 0
    }
  }
}

