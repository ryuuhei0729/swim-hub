// =============================================================================
// ダッシュボードAPI - Swim Hub共通パッケージ
// カレンダーデータ取得など
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { CalendarItemType } from '../types/database'

export interface CalendarEntry {
  id: string
  item_type: CalendarItemType
  item_date: string
  title: string
  location?: string
  time_result?: number
  pool_type?: number
  tags?: string[]
  note?: string
  competition_name?: string
  is_relaying?: boolean
  style?: {
    id: number
    name_jp: string
    distance: number
  }
}

export class DashboardAPI {
  constructor(private supabase: SupabaseClient) {}

  /**
   * カレンダーエントリー取得（月間）
   */
  async getCalendarEntries(
    startDate: string,
    endDate: string
  ): Promise<CalendarEntry[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // 練習記録取得
    const { data: practices, error: practicesError } = await this.supabase
      .from('practices')
      .select(`
        id,
        date,
        place,
        note,
        practice_logs (
          id,
          style,
          distance,
          practice_times (id, time)
        )
      `)
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)

    if (practicesError) throw practicesError

    // 大会記録取得
    const { data: records, error: recordsError } = await this.supabase
      .from('records')
      .select(`
        id,
        time,
        video_url,
        note,
        is_relaying,
        created_at,
        competition:competitions (
          id,
          title,
          date,
          place,
          pool_type
        ),
        style:styles (
          id,
          name_jp,
          distance
        )
      `)
      .eq('user_id', user.id)

    if (recordsError) throw recordsError

    // データ整形
    const entries: CalendarEntry[] = []

    // 練習記録を変換
    practices?.forEach(practice => {
      entries.push({
        id: practice.id,
        item_type: 'practice',
        item_date: practice.date,
        title: `練習 - ${practice.place || '場所未設定'}`,
        location: practice.place || undefined,
        note: practice.note || undefined,
        // 編集時に必要なフィールドを追加
        date: practice.date,
        place: practice.place,
        practice_logs: practice.practice_logs
      } as any)
    })

    // 大会記録を変換
    records?.forEach(record => {
      const competition = record.competition as any
      entries.push({
        id: record.id,
        item_type: 'record',
        item_date: competition?.date || record.created_at?.split('T')[0],
        title: `${(record.style as any)?.name_jp || '種目不明'}`,
        time_result: record.time,
        pool_type: competition?.pool_type,
        note: record.note || undefined,
        competition_name: competition?.title,
        is_relaying: record.is_relaying,
        style: record.style ? {
          id: (record.style as any).id,
          name_jp: (record.style as any).name_jp,
          distance: (record.style as any).distance
        } : undefined
      })
    })

    // 日付順にソート
    return entries.sort((a, b) => 
      new Date(b.item_date).getTime() - new Date(a.item_date).getTime()
    )
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

