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

    // 大会取得（期間内）
    const { data: competitions, error: competitionsError } = await this.supabase
      .from('competitions')
      .select(`
        id,
        title,
        date,
        place,
        pool_type,
        note
      `)
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)

    if (competitionsError) throw competitionsError

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
        competition_id,
        competition:competitions (
          id,
          title,
          date,
          place,
          pool_type,
          note
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

    // 大会ごとに処理
    competitions?.forEach(competition => {
      // この大会に紐づくRecordを取得
      const competitionRecords = records?.filter(r => r.competition_id === competition.id) || []
      
      if (competitionRecords.length > 0) {
        // Recordがある場合は、各Recordをエントリーとして追加
        competitionRecords.forEach(record => {
          entries.push({
            id: record.id,
            item_type: 'record',
            item_date: competition.date,
            title: `${(record.style as any)?.name_jp || '種目不明'}`,
            time_result: record.time,
            pool_type: competition.pool_type,
            note: record.note || undefined,
            competition_name: competition.title,
            is_relaying: record.is_relaying,
            style: record.style ? {
              id: (record.style as any).id,
              name_jp: (record.style as any).name_jp,
              distance: (record.style as any).distance
            } : undefined,
            // 編集時に必要なフィールドを追加
            competition_id: competition.id,
            competition: competition
          } as any)
        })
      } else {
        // Recordがない場合は、Competition自体をエントリーとして追加
        entries.push({
          id: competition.id,
          item_type: 'competition',
          item_date: competition.date,
          title: `大会 - ${competition.title}`,
          location: competition.place || undefined,
          pool_type: competition.pool_type,
          note: competition.note || undefined,
          competition_name: competition.title,
          // 編集時に必要なフィールドを追加
          date: competition.date,
          place: competition.place
        } as any)
      }
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

