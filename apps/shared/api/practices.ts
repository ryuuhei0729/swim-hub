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
    PracticeWithLogs,
} from '../types'

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
   * IDで練習記録を取得
   * @param id 練習記録ID
   */
  async getPracticeById(id: string): Promise<PracticeWithLogs | null> {
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
      .eq('id', id)
      .single()

    if (error) {
      // レコードが見つからない場合は null を返す
      if (error.code === 'PGRST116') {
        return null
      }
      throw error
    }
    return data as PracticeWithLogs
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
   * @param callback - 変更時のコールバック関数
   * @param userId - (オプション) ユーザーIDでフィルタリング。指定した場合、該当ユーザーのみの変更を受信
   */
  subscribeToPractices(callback: (practice: Practice) => void, userId?: string) {
    const config: any = {
      event: '*',
      schema: 'public',
      table: 'practices'
    }

    // ユーザーIDでフィルタリング (帯域幅削減)
    if (userId) {
      config.filter = `user_id=eq.${userId}`
    }

    return this.supabase
      .channel('practices-changes')
      .on('postgres_changes', config, (payload) => {
        if (payload.new) {
          callback(payload.new as Practice)
        }
      })
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
  async getPracticeTags(): Promise<import('../types').PracticeTag[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('practice_tags')
      .select('*')
      .eq('user_id', user.id)
      .order('name')

    if (error) throw error
    return (data || []) as import('../types').PracticeTag[]
  }

  /**
   * 練習タグ作成
   */
  async createPracticeTag(name: string, color: string): Promise<import('../types').PracticeTag> {
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
    return data as import('../types').PracticeTag
  }

  /**
   * 練習タグ更新
   */
  async updatePracticeTag(id: string, name: string, color: string): Promise<import('../types').PracticeTag> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('practice_tags')
      .update({
        name: name.trim(),
        color
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error
    return data as import('../types').PracticeTag
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

  // =========================================================================
  // 練習画像の操作
  // NOTE: 画像パスはpractices.image_pathsで管理（practice_imagesテーブルは廃止）
  // =========================================================================

  /**
   * 練習画像をアップロード（API Route経由）
   * @param practiceId 練習記録ID
   * @param file 圧縮済み画像ファイル
   * @returns 保存されたパス
   */
  async uploadPracticeImage(
    practiceId: string,
    file: File
  ): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('practiceId', practiceId)

    const appUrl = typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const response = await fetch(`${appUrl}/api/storage/images/practice`, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    })

    if (!response.ok) {
      let errorMessage = '画像のアップロードに失敗しました'
      let bodyText = ''

      try {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json() as { error?: string }
          if (errorData.error) {
            errorMessage = errorData.error
          }
        } else {
          bodyText = await response.text()
        }
      } catch {
        try {
          bodyText = await response.text()
        } catch {
          // テキスト取得も失敗した場合は無視
        }
      }

      const details = bodyText ? `: ${bodyText}` : ''
      throw new Error(`${errorMessage} (HTTP ${response.status}${details})`)
    }

    const result = await response.json() as { path: string }
    return result.path
  }

  /**
   * 複数の練習画像を一括アップロード
   * エラー発生時は成功済みの画像をすべてロールバック
   */
  async uploadPracticeImages(
    practiceId: string,
    files: File[]
  ): Promise<string[]> {
    const results: string[] = []

    try {
      for (const file of files) {
        const path = await this.uploadPracticeImage(practiceId, file)
        results.push(path)
      }
      return results
    } catch (error) {
      // ロールバック: 成功済みの画像をすべて削除
      console.error('画像アップロード中にエラーが発生。ロールバックを開始:', error)

      for (const path of results) {
        try {
          await this.deletePracticeImage(path)
        } catch (deleteError) {
          console.error(`画像 ${path} の削除に失敗:`, deleteError)
        }
      }

      throw error
    }
  }

  /**
   * 練習画像を削除（API Route経由）
   * @param path 画像パス
   */
  async deletePracticeImage(path: string): Promise<void> {
    const appUrl = typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const response = await fetch(`${appUrl}/api/storage/images/practice?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
      credentials: 'include'
    })

    if (!response.ok) {
      let errorMessage = '画像の削除に失敗しました'
      let bodyText = ''

      try {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json() as { error?: string }
          if (errorData.error) {
            errorMessage = errorData.error
          }
        } else {
          bodyText = await response.text()
        }
      } catch {
        try {
          bodyText = await response.text()
        } catch {
          // テキスト取得も失敗した場合は無視
        }
      }

      const details = bodyText ? `: ${bodyText}` : ''
      throw new Error(`${errorMessage} (HTTP ${response.status}${details})`)
    }
  }

  /**
   * 複数の練習画像を一括削除
   */
  async deletePracticeImages(paths: string[]): Promise<void> {
    for (const path of paths) {
      await this.deletePracticeImage(path)
    }
  }

  /**
   * 画像のURL（publicUrl）を取得
   * NOTE: R2使用時はR2_PUBLIC_URLを使用
   */
  getPracticeImageUrl(path: string): string {
    // R2が有効な場合はR2のURLを使用
    const r2PublicUrl = typeof window !== 'undefined'
      ? (window as unknown as { __NEXT_PUBLIC_R2_PUBLIC_URL__?: string }).__NEXT_PUBLIC_R2_PUBLIC_URL__
      : process.env.NEXT_PUBLIC_R2_PUBLIC_URL

    if (r2PublicUrl) {
      return `${r2PublicUrl}/practice-images/${path}`
    }

    // フォールバック: Supabase Storage
    const { data } = this.supabase.storage
      .from('practice-images')
      .getPublicUrl(path)
    return data.publicUrl
  }

  // =========================================================================
  // 場所候補の取得
  // =========================================================================

  /**
   * 過去の練習で使用した場所一覧を取得（重複排除・最近使われた順）
   */
  async getUniquePlaces(): Promise<string[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('practices')
      .select('place, date')
      .eq('user_id', user.id)
      .not('place', 'is', null)
      .not('place', 'eq', '')
      .order('date', { ascending: false })

    if (error) throw error

    // 重複排除しつつ、最近使われた順を維持
    const seen = new Set<string>()
    const uniquePlaces: string[] = []
    for (const item of data || []) {
      const place = item.place?.trim()
      if (place && !seen.has(place)) {
        seen.add(place)
        uniquePlaces.push(place)
      }
    }

    return uniquePlaces
  }
}

