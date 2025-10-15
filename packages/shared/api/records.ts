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

export class RecordAPI {
  constructor(private supabase: SupabaseClient) {}

  // =========================================================================
  // 記録の操作
  // =========================================================================

  /**
   * 記録一覧取得（期間指定）
   */
  async getRecords(
    startDate?: string,
    endDate?: string,
    styleId?: number
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

    const { data, error } = await query

    if (error) throw error
    return data as RecordWithDetails[]
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

