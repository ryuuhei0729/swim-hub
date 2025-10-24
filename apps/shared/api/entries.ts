// =============================================================================
// エントリーAPI - Swim Hub共通パッケージ
// Web/Mobile共通で使用するSupabase API関数（個人・チーム共通）
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import {
  Entry,
  EntryInsert,
  EntryUpdate,
  EntryWithDetails
} from '../types/database'

export class EntryAPI {
  constructor(private supabase: SupabaseClient) {}

  // =========================================================================
  // エントリーの取得
  // =========================================================================

  /**
   * 大会別のエントリー一覧取得
   */
  async getEntriesByCompetition(competitionId: string): Promise<EntryWithDetails[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('entries')
      .select(`
        *,
        competition:competitions(*),
        style:styles(*),
        user:users(*)
      `)
      .eq('competition_id', competitionId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return data as EntryWithDetails[]
  }

  /**
   * ユーザー別のエントリー一覧取得（自分のエントリーのみ）
   */
  async getEntriesByUser(userId?: string): Promise<EntryWithDetails[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const targetUserId = userId || user.id

    const { data, error } = await this.supabase
      .from('entries')
      .select(`
        *,
        competition:competitions(*),
        style:styles(*),
        user:users(*),
        team:teams(*)
      `)
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as EntryWithDetails[]
  }

  /**
   * チーム別のエントリー一覧取得
   */
  async getEntriesByTeam(teamId: string): Promise<EntryWithDetails[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // チームメンバーシップ確認
    const { data: membership } = await this.supabase
      .from('team_memberships')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!membership) {
      throw new Error('チームへのアクセス権限がありません')
    }

    const { data, error } = await this.supabase
      .from('entries')
      .select(`
        *,
        competition:competitions(*),
        style:styles(*),
        user:users(*),
        team:teams(*)
      `)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as EntryWithDetails[]
  }

  /**
   * 単一エントリー取得
   */
  async getEntry(entryId: string): Promise<EntryWithDetails> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('entries')
      .select(`
        *,
        competition:competitions(*),
        style:styles(*),
        user:users(*),
        team:teams(*)
      `)
      .eq('id', entryId)
      .single()

    if (error) throw error
    return data as EntryWithDetails
  }

  // =========================================================================
  // エントリーの作成
  // =========================================================================

  /**
   * 個人エントリー作成
   */
  async createPersonalEntry(entry: Omit<EntryInsert, 'team_id' | 'user_id'>): Promise<Entry> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('entries')
      .insert({
        ...entry,
        user_id: user.id,
        team_id: null // 個人エントリー
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * チームエントリー作成
   */
  async createTeamEntry(
    teamId: string, 
    userId: string,
    entry: Omit<EntryInsert, 'team_id' | 'user_id'>
  ): Promise<Entry> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // チームメンバーシップ確認
    const { data: membership } = await this.supabase
      .from('team_memberships')
      .select('id, role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!membership) {
      throw new Error('チームへのアクセス権限がありません')
    }

    const { data, error } = await this.supabase
      .from('entries')
      .insert({
        ...entry,
        team_id: teamId,
        user_id: userId
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * 複数エントリーを一括作成（チーム用）
   */
  async createBulkEntries(
    teamId: string,
    entries: Array<{
      userId: string
      competitionId: string
      styleId: number
      entryTime?: number | null
      note?: string | null
    }>
  ): Promise<Entry[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // チーム管理者権限確認
    const { data: membership } = await this.supabase
      .from('team_memberships')
      .select('id, role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!membership || membership.role !== 'admin') {
      throw new Error('チーム管理者権限が必要です')
    }

    const insertData = entries.map(entry => ({
      team_id: teamId,
      user_id: entry.userId,
      competition_id: entry.competitionId,
      style_id: entry.styleId,
      entry_time: entry.entryTime || null,
      note: entry.note || null
    }))

    const { data, error } = await this.supabase
      .from('entries')
      .insert(insertData)
      .select()

    if (error) throw error
    return data
  }

  // =========================================================================
  // エントリーの更新
  // =========================================================================

  /**
   * エントリー更新
   */
  async updateEntry(entryId: string, updates: EntryUpdate): Promise<Entry> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('entries')
      .update(updates)
      .eq('id', entryId)
      .select()
      .single()

    if (error) throw error
    return data
  }

  // =========================================================================
  // エントリーの削除
  // =========================================================================

  /**
   * エントリー削除
   */
  async deleteEntry(entryId: string): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { error } = await this.supabase
      .from('entries')
      .delete()
      .eq('id', entryId)

    if (error) throw error
  }

  /**
   * 大会の全エントリーを削除（管理者のみ）
   */
  async deleteEntriesByCompetition(competitionId: string): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { error } = await this.supabase
      .from('entries')
      .delete()
      .eq('competition_id', competitionId)

    if (error) throw error
  }

  // =========================================================================
  // ユーティリティ
  // =========================================================================

  /**
   * 既存エントリーのチェック（重複確認）
   */
  async checkExistingEntry(
    competitionId: string,
    userId: string,
    styleId: number
  ): Promise<Entry | null> {
    const { data, error } = await this.supabase
      .from('entries')
      .select('*')
      .eq('competition_id', competitionId)
      .eq('user_id', userId)
      .eq('style_id', styleId)
      .maybeSingle()

    if (error) throw error
    return data
  }

  /**
   * 大会のエントリー数を取得
   */
  async getEntryCount(competitionId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('entries')
      .select('*', { count: 'exact', head: true })
      .eq('competition_id', competitionId)

    if (error) throw error
    return count || 0
  }
}

