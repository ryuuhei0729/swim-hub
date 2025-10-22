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
    return calendarData?.map(item => ({
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
  }

  /**
   * 月間サマリー取得
   */
  async getMonthlySummary(year: number, month: number) {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`

    // 練習回数
    const { count: practiceCount } = await this.supabase
      .from('practices')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)

    // 記録数
    const { count: recordCount } = await this.supabase
      .from('records')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', startDate)
      .lte('created_at', endDate)

    return {
      practiceCount: practiceCount || 0,
      recordCount: recordCount || 0
    }
  }
}

