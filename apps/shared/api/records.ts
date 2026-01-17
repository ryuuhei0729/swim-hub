// =============================================================================
// 大会記録API - Swim Hub共通パッケージ
// Web/Mobile共通で使用するSupabase API関数
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import {
  Competition,
  CompetitionInsert,
  CompetitionUpdate,
  Record,
  RecordInsert,
  RecordUpdate,
  RecordWithDetails,
  SplitTime,
  SplitTimeInsert
} from '../types/database'
import type { BestTime } from '../types/ui'

export class RecordAPI {
  constructor(private supabase: SupabaseClient) {}

  // =========================================================================
  // 記録の操作
  // =========================================================================

  /**
   * 記録一覧取得（期間指定）
   * @param startDate 開始日（オプション）
   * @param endDate 終了日（オプション）
   * @param styleId 種目ID（オプション）
   * @param limit 取得件数（オプション）
   * @param offset オフセット（オプション）
   */
  async getRecords(
    startDate?: string,
    endDate?: string,
    styleId?: number,
    limit?: number,
    offset?: number
  ): Promise<RecordWithDetails[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    let query = this.supabase
      .from('records')
      .select(`
        *,
        competition:competitions(*),
        style:styles(*),
        split_times(*)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (startDate) {
      query = query.gte('created_at', startDate)
    }
    if (endDate) {
      query = query.lte('created_at', endDate)
    }
    if (styleId) {
      query = query.eq('style_id', styleId)
    }

    if (limit !== undefined) {
      if (offset !== undefined) {
        query = query.range(offset, offset + limit - 1)
      } else {
        query = query.limit(limit)
      }
    }

    const { data, error } = await query

    if (error) throw error
    return data as RecordWithDetails[]
  }

  /**
   * 記録の総件数を取得（期間指定）
   */
  async countRecords(
    startDate?: string,
    endDate?: string,
    styleId?: number
  ): Promise<number> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    let query = this.supabase
      .from('records')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (startDate) {
      query = query.gte('created_at', startDate)
    }
    if (endDate) {
      query = query.lte('created_at', endDate)
    }
    if (styleId) {
      query = query.eq('style_id', styleId)
    }

    const { count, error } = await query

    if (error) throw error
    return count || 0
  }

  /**
   * 記録作成
   */
  async createRecord(
    record: Omit<RecordInsert, 'user_id'>
  ): Promise<Record> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('records')
      .insert({ ...record, user_id: user.id })
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * 記録更新
   */
  async updateRecord(id: string, updates: RecordUpdate): Promise<Record> {
    const { data, error } = await this.supabase
      .from('records')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * 記録削除
   */
  async deleteRecord(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('records')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  /**
   * 記録一括作成（ベストタイム一括入力用）
   */
  async createBulkRecords(
    records: Array<{
      style_id: number
      time: number
      is_relaying: boolean
      note: string | null
      pool_type: number
      reaction_time?: number | null
    }>
  ): Promise<{ created: number; errors: string[] }> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const results = {
      created: 0,
      errors: [] as string[]
    }

    // バッチ処理（1度に100件ずつ）
    const batchSize = 100
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize).map(record => ({
        user_id: user.id,
        style_id: record.style_id,
        time: record.time,
        is_relaying: record.is_relaying,
        note: record.note,
        pool_type: record.pool_type,
        competition_id: null, // 大会に紐づけない
        team_id: null, // 個人記録
        video_url: null,
        reaction_time: record.reaction_time || null
      }))

      const { data, error } = await this.supabase
        .from('records')
        .insert(batch)
        .select()

      if (error) {
        results.errors.push(`バッチ ${Math.floor(i / batchSize) + 1} の登録に失敗: ${error.message}`)
      } else {
        results.created += data.length
      }
    }

    return results
  }

  /**
   * ベストタイム取得
   * 種目・プール種別ごとの最速タイムを計算
   * @param userId ユーザーID（オプション、指定しない場合は現在のユーザー）
   */
  async getBestTimes(userId?: string): Promise<BestTime[]> {
    let targetUserId = userId
    if (!targetUserId) {
      const { data: { user } } = await this.supabase.auth.getUser()
      if (!user) throw new Error('認証が必要です')
      targetUserId = user.id
    }

    // recordsテーブルから記録を取得
    const { data, error } = await this.supabase
      .from('records')
      .select(`
        id,
        time,
        created_at,
        pool_type,
        is_relaying,
        style_id,
        styles!records_style_id_fkey (
          name_jp,
          distance
        ),
        competitions!records_competition_id_fkey (
          title,
          date
        )
      `)
      .eq('user_id', targetUserId)
      .order('time', { ascending: true })

    if (error) {
      console.error('ベストタイム取得エラー:', error)
      throw error
    }

    if (!data || !Array.isArray(data)) {
      return []
    }

    // レスポンスの型変換（Supabaseの配列/単一オブジェクトの不整合に対応）
    interface RecordWithRelations {
      id: string
      time: number
      created_at: string
      pool_type: number
      is_relaying: boolean
      style_id: number
      styles?: { name_jp: string; distance: number } | null
      competitions?: { title: string; date: string } | null
    }

    type RecordWithRelationsResponse = Omit<RecordWithRelations, 'styles' | 'competitions'> & {
      styles?: RecordWithRelations['styles'] | RecordWithRelations['styles'][]
      competitions?: RecordWithRelations['competitions'] | RecordWithRelations['competitions'][]
    }

    const records: RecordWithRelations[] = (data as RecordWithRelationsResponse[]).map((record) => {
      const styleData = Array.isArray(record.styles) ? record.styles[0] : record.styles
      const competitionData = Array.isArray(record.competitions)
        ? record.competitions[0]
        : record.competitions

      return {
        id: record.id,
        time: record.time,
        created_at: record.created_at,
        pool_type: record.pool_type,
        is_relaying: record.is_relaying,
        style_id: record.style_id,
        styles: styleData
          ? { name_jp: styleData.name_jp, distance: styleData.distance }
          : null,
        competitions: competitionData
          ? { title: competitionData.title, date: competitionData.date }
          : null,
      }
    })

    // 引き継ぎなしのベストタイム（種目、プール種別ごと）
    const bestTimesByStyleAndPool = new Map<string, BestTime>()
    // 引き継ぎありのベストタイム（種目、プール種別ごと）
    const relayingBestTimesByStyleAndPool = new Map<
      string,
      {
        id: string
        time: number
        created_at: string
        competition?: {
          title: string
          date: string
        }
      }
    >()

    records.forEach((record) => {
      const styleKey = record.styles?.name_jp || 'Unknown'
      const poolType = record.pool_type ?? 0
      const key = `${styleKey}_${poolType}`

      if (record.is_relaying) {
        // 引き継ぎありのタイム
        if (
          !relayingBestTimesByStyleAndPool.has(key) ||
          record.time < relayingBestTimesByStyleAndPool.get(key)!.time
        ) {
          relayingBestTimesByStyleAndPool.set(key, {
            id: record.id,
            time: record.time,
            created_at: record.created_at,
            competition: record.competitions
              ? {
                  title: record.competitions.title,
                  date: record.competitions.date,
                }
              : undefined,
          })
        }
      } else {
        // 引き継ぎなしのタイム
        if (
          !bestTimesByStyleAndPool.has(key) ||
          record.time < bestTimesByStyleAndPool.get(key)!.time
        ) {
          bestTimesByStyleAndPool.set(key, {
            id: record.id,
            time: record.time,
            created_at: record.created_at,
            pool_type: poolType,
            is_relaying: false,
            style_id: record.style_id,
            style: {
              name_jp: record.styles?.name_jp || 'Unknown',
              distance: record.styles?.distance || 0,
            },
            competition: record.competitions
              ? {
                  title: record.competitions.title,
                  date: record.competitions.date,
                }
              : undefined,
          })
        }
      }
    })

    // 引き継ぎなしのタイムに、引き継ぎありのタイムを紐付ける
    const result: BestTime[] = []
    bestTimesByStyleAndPool.forEach((bestTime, key) => {
      const relayingTime = relayingBestTimesByStyleAndPool.get(key)
      result.push({
        ...bestTime,
        relayingTime: relayingTime,
      })
    })

    // 引き継ぎなしがなく、引き継ぎありのみの場合も追加
    relayingBestTimesByStyleAndPool.forEach((relayingTime, key) => {
      if (!bestTimesByStyleAndPool.has(key)) {
        // キーから種目名とプール種別を取得
        const lastUnderscoreIndex = key.lastIndexOf('_')
        if (lastUnderscoreIndex === -1) {
          return
        }

        const styleName = key.slice(0, lastUnderscoreIndex)
        const poolTypeStr = key.slice(lastUnderscoreIndex + 1)
        const poolType = Number.isInteger(parseInt(poolTypeStr, 10)) ? parseInt(poolTypeStr, 10) : NaN
        if (Number.isNaN(poolType)) {
          return
        }

        // 種目情報を取得（最初のレコードから）
        const record = records.find(
          (r) =>
            (r.styles?.name_jp || 'Unknown') === styleName &&
            (r.pool_type ?? 0) === poolType
        )

        if (record) {
          result.push({
            id: relayingTime.id,
            time: relayingTime.time,
            created_at: relayingTime.created_at,
            pool_type: poolType,
            is_relaying: true,
            style_id: record.style_id,
            style: {
              name_jp: record.styles?.name_jp || 'Unknown',
              distance: record.styles?.distance || 0,
            },
            competition: relayingTime.competition,
          })
        }
      }
    })

    return result
  }

  // =========================================================================
  // 大会の操作
  // =========================================================================

  /**
   * 大会一覧取得
   */
  async getCompetitions(startDate?: string, endDate?: string): Promise<Competition[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    let query = this.supabase
      .from('competitions')
      .select('*')
      .or(`user_id.eq.${user.id},user_id.is.null`) // 個人大会 or 共有大会
      .order('date', { ascending: false })

    if (startDate) {
      query = query.gte('date', startDate)
    }
    if (endDate) {
      query = query.lte('date', endDate)
    }

    const { data, error } = await query

    if (error) throw error
    return data
  }

  /**
   * 大会作成
   */
  async createCompetition(
    competition: Omit<CompetitionInsert, 'user_id'>
  ): Promise<Competition> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('competitions')
      .insert({ ...competition, user_id: user.id })
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * 大会更新
   */
  async updateCompetition(id: string, updates: CompetitionUpdate): Promise<Competition> {
    const { data, error } = await this.supabase
      .from('competitions')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * 大会削除（個人大会のみ）
   */
  async deleteCompetition(id: string): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { error } = await this.supabase
      .from('competitions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id) // 個人大会のみ削除可能

    if (error) throw error
  }

  // =========================================================================
  // スプリットタイムの操作
  // =========================================================================

  /**
   * スプリットタイム作成
   */
  async createSplitTime(splitTime: SplitTimeInsert): Promise<SplitTime> {
    const { data, error } = await this.supabase
      .from('split_times')
      .insert(splitTime)
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * 複数のスプリットタイムを一括作成
   */
  async createSplitTimes(splitTimes: SplitTimeInsert[]): Promise<SplitTime[]> {
    if (splitTimes.length === 0) return []

    const { data, error } = await this.supabase
      .from('split_times')
      .insert(splitTimes)
      .select()

    if (error) throw error
    return data
  }

  /**
   * 記録のスプリットタイムを全て削除して再作成
   */
  async replaceSplitTimes(
    recordId: string,
    splitTimes: Omit<SplitTimeInsert, 'record_id'>[]
  ): Promise<SplitTime[]> {
    // 既存のスプリットタイムを削除
    await this.supabase
      .from('split_times')
      .delete()
      .eq('record_id', recordId)

    // 新しいスプリットタイムを作成
    if (splitTimes.length === 0) return []

    const { data, error } = await this.supabase
      .from('split_times')
      .insert(splitTimes.map(st => ({ ...st, record_id: recordId })))
      .select()

    if (error) throw error
    return data
  }

  // =========================================================================
  // リアルタイム購読
  // =========================================================================

  /**
   * 記録の変更をリアルタイム購読
   */
  subscribeToRecords(callback: (record: Record) => void) {
    return this.supabase
      .channel('records-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'records'
        },
        (payload) => {
          if (payload.new) {
            callback(payload.new as Record)
          }
        }
      )
      .subscribe()
  }

  /**
   * 大会の変更をリアルタイム購読
   */
  subscribeToCompetitions(callback: (competition: Competition) => void) {
    return this.supabase
      .channel('competitions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'competitions'
        },
        (payload) => {
          if (payload.new) {
            callback(payload.new as Competition)
          }
        }
      )
      .subscribe()
  }
}

