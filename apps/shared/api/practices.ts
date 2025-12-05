// =============================================================================
// 練習記録API - Swim Hub共通パッケージ
// Web/Mobile共通で使用するSupabase API関数
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import {
  Practice,
  PracticeInsert,
  PracticeLog,
  PracticeLogInsert,
  PracticeLogUpdate,
  PracticeTime,
  PracticeTimeInsert,
  PracticeUpdate,
  PracticeWithLogs
} from '../types/database'

export class PracticeAPI {
  constructor(private supabase: SupabaseClient) {}

  // =========================================================================
  // 練習（日単位）の操作
  // =========================================================================

  /**
   * 練習記録一覧取得（期間指定）
   * @param startDate 開始日
   * @param endDate 終了日
   * @param limit 取得件数（オプション）
   * @param offset オフセット（オプション）
   */
  async getPractices(
    startDate: string,
    endDate: string,
    limit?: number,
    offset?: number
  ): Promise<PracticeWithLogs[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    let query = this.supabase
      .from('practices')
      .select(`
        *,
        practice_logs (
          *,
          practice_times (*),
          practice_log_tags (
            practice_tag_id,
            practice_tags (
              id,
              name,
              color
            )
          )
        )
      `)
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false })

    if (limit !== undefined) {
      if (offset !== undefined) {
        query = query.range(offset, offset + limit - 1)
      } else {
        query = query.limit(limit)
      }
    }

    const { data, error } = await query

    if (error) throw error
    return data as PracticeWithLogs[]
  }

  /**
   * 練習記録の総件数を取得（期間指定）
   */
  async countPractices(startDate: string, endDate: string): Promise<number> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { count, error } = await this.supabase
      .from('practices')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)

    if (error) throw error
    return count || 0
  }

  /**
   * 特定日の練習記録取得
   */
  async getPracticesByDate(date: string): Promise<PracticeWithLogs[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('practices')
      .select(`
        *,
        practice_logs (
          *,
          practice_times (*),
          practice_log_tags (
            practice_tag_id,
            practice_tags (
              id,
              name,
              color
            )
          )
        )
      `)
      .eq('user_id', user.id)
      .eq('date', date)

    if (error) throw error
    return data as PracticeWithLogs[]
  }

  /**
   * 練習記録作成
   */
  async createPractice(
    practice: Omit<PracticeInsert, 'user_id'>
  ): Promise<Practice> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('practices')
      .insert({ ...practice, user_id: user.id })
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * 練習記録更新
   */
  async updatePractice(id: string, updates: PracticeUpdate): Promise<Practice> {
    const { data, error } = await this.supabase
      .from('practices')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * 練習記録削除
   */
  async deletePractice(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('practices')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  // =========================================================================
  // 練習ログ（セット単位）の操作
  // =========================================================================

  /**
   * 練習ログ作成
   */
  async createPracticeLog(log: Omit<PracticeLogInsert, 'user_id'>): Promise<PracticeLog> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('practice_logs')
      .insert({ ...log, user_id: user.id })
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * 複数の練習ログを一括作成
   */
  async createPracticeLogs(logs: Omit<PracticeLogInsert, 'user_id'>[]): Promise<PracticeLog[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const logsWithUserId = logs.map(log => ({ ...log, user_id: user.id }))
    const { data, error } = await this.supabase
      .from('practice_logs')
      .insert(logsWithUserId)
      .select()

    if (error) throw error
    return data
  }

  /**
   * 練習ログ更新
   */
  async updatePracticeLog(id: string, updates: PracticeLogUpdate): Promise<PracticeLog> {
    const { data, error } = await this.supabase
      .from('practice_logs')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * 練習ログ削除
   */
  async deletePracticeLog(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('practice_logs')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  // =========================================================================
  // 練習タイムの操作
  // =========================================================================

  /**
   * 練習タイム作成
   */
  async createPracticeTime(time: PracticeTimeInsert): Promise<PracticeTime> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('practice_times')
      .insert({
        ...time,
        user_id: user.id
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * 複数の練習タイムを一括作成
   */
  async createPracticeTimes(times: PracticeTimeInsert[]): Promise<PracticeTime[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('practice_times')
      .insert(times.map(time => ({
        ...time,
        user_id: user.id
      })))
      .select()

    if (error) throw error
    return data
  }

  /**
   * 練習ログのタイムを全て削除して再作成
   */
  async replacePracticeTimes(
    practiceLogId: string,
    times: Omit<PracticeTimeInsert, 'practice_log_id' | 'user_id'>[]
  ): Promise<PracticeTime[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // 既存のタイムを削除
    await this.supabase
      .from('practice_times')
      .delete()
      .eq('practice_log_id', practiceLogId)

    // 新しいタイムを作成
    if (times.length === 0) return []

    const { data, error } = await this.supabase
      .from('practice_times')
      .insert(times.map(t => ({ 
        ...t, 
        practice_log_id: practiceLogId,
        user_id: user.id
      })))
      .select()

    if (error) throw error
    return data
  }

  /**
   * 練習タイム削除
   */
  async deletePracticeTime(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('practice_times')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  // =========================================================================
  // リアルタイム購読
  // =========================================================================

  /**
   * 練習記録の変更をリアルタイム購読
   */
  subscribeToPractices(callback: (practice: Practice) => void) {
    return this.supabase
      .channel('practices-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'practices'
        },
        (payload) => {
          if (payload.new) {
            callback(payload.new as Practice)
          }
        }
      )
      .subscribe()
  }

  /**
   * 練習ログの変更をリアルタイム購読
   */
  subscribeToPracticeLogs(practiceId: string, callback: (log: PracticeLog) => void) {
    return this.supabase
      .channel(`practice-logs-${practiceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'practice_logs',
          filter: `practice_id=eq.${practiceId}`
        },
        (payload) => {
          if (payload.new) {
            callback(payload.new as PracticeLog)
          }
        }
      )
      .subscribe()
  }

  // =========================================================================
  // 練習タグの操作
  // =========================================================================

  /**
   * 練習タグ一覧取得
   */
  async getPracticeTags(): Promise<import('../types/database').PracticeTag[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('practice_tags')
      .select('*')
      .eq('user_id', user.id)
      .order('name')

    if (error) throw error
    return (data || []) as import('../types/database').PracticeTag[]
  }

  /**
   * 練習タグ作成
   */
  async createPracticeTag(name: string, color: string): Promise<import('../types/database').PracticeTag> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('practice_tags')
      .insert({
        user_id: user.id,
        name: name.trim(),
        color
      })
      .select()
      .single()

    if (error) throw error
    return data as import('../types/database').PracticeTag
  }

  /**
   * 練習タグ更新
   */
  async updatePracticeTag(id: string, name: string, color: string): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { error } = await this.supabase
      .from('practice_tags')
      .update({
        name: name.trim(),
        color
      })
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error
  }

  /**
   * 練習タグ削除
   */
  async deletePracticeTag(id: string): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { error } = await this.supabase
      .from('practice_tags')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error
  }
}

