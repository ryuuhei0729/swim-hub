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
} from '../types'
import { requireAuth, requireTeamMembership, requireTeamAdmin } from './auth-utils'

export class EntryAPI {
  constructor(private supabase: SupabaseClient) {}

  // =========================================================================
  // エントリーの取得
  // =========================================================================

  /**
   * 大会別のエントリー一覧取得
   */
  async getEntriesByCompetition(competitionId: string): Promise<EntryWithDetails[]> {
    await requireAuth(this.supabase)

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
   * 現在のユーザーのエントリー一覧取得
   * セキュリティのため、常に認証されたユーザー自身のエントリーのみを取得します
   */
  async getEntriesByUser(): Promise<EntryWithDetails[]> {
    const userId = await requireAuth(this.supabase)

    const { data, error } = await this.supabase
      .from('entries')
      .select(`
        *,
        competition:competitions(*),
        style:styles(*),
        user:users(*),
        team:teams(*)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as EntryWithDetails[]
  }

  /**
   * チーム別のエントリー一覧取得
   */
  async getEntriesByTeam(teamId: string): Promise<EntryWithDetails[]> {
    await requireTeamMembership(this.supabase, teamId)

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
   * 単一エントリー取得（アクセス制御付き）
   * エントリーの所有者またはチーム管理者のみがアクセス可能
   */
  async getEntry(entryId: string): Promise<EntryWithDetails> {
    const userId = await requireAuth(this.supabase)

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

    // アクセス制御チェック
    // 1. エントリーの所有者かどうかチェック
    if (data.user_id === userId) {
      return data as EntryWithDetails
    }

    // 2. チームエントリーの場合、チーム管理者かどうかチェック
    if (data.team_id) {
      const { data: membership, error: membershipError } = await this.supabase
        .from('team_memberships')
        .select('role')
        .eq('team_id', data.team_id)
        .eq('user_id', userId)
        .eq('is_active', true)
        .single()

      if (!membershipError && membership?.role === 'admin') {
        return data as EntryWithDetails
      }
    }

    // アクセス権限がない場合
    throw new Error('アクセスが拒否されました')
  }

  // =========================================================================
  // エントリーの作成
  // =========================================================================

  /**
   * 個人エントリー作成
   */
  async createPersonalEntry(entry: Omit<EntryInsert, 'team_id' | 'user_id'>): Promise<Entry> {
    const userId = await requireAuth(this.supabase)

    const { data, error } = await this.supabase
      .from('entries')
      .insert({
        ...entry,
        user_id: userId,
        team_id: null // 個人エントリー
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * チームエントリー作成（アクセス制御付き）
   * 管理者は任意のユーザーのエントリーを作成可能
   * 一般メンバーは自分のエントリーのみ作成可能
   */
  async createTeamEntry(
    teamId: string,
    targetUserId: string,
    entry: Omit<EntryInsert, 'team_id' | 'user_id'>
  ): Promise<Entry> {
    const currentUserId = await requireAuth(this.supabase)

    // チームメンバーシップ確認
    const { data: membership } = await this.supabase
      .from('team_memberships')
      .select('id, role')
      .eq('team_id', teamId)
      .eq('user_id', currentUserId)
      .eq('is_active', true)
      .single()

    if (!membership) {
      throw new Error('チームへのアクセス権限がありません')
    }

    // アクセス制御チェック
    // 管理者以外は自分のエントリーのみ作成可能
    if (membership.role !== 'admin' && targetUserId !== currentUserId) {
      throw new Error('自分のエントリーのみ作成可能です')
    }

    const { data, error } = await this.supabase
      .from('entries')
      .insert({
        ...entry,
        team_id: teamId,
        user_id: targetUserId
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
    await requireTeamAdmin(this.supabase, teamId)

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
   * エントリー更新（アクセス制御付き）
   * エントリーの所有者またはチーム管理者のみが更新可能
   * competition_idとuser_idの更新は禁止
   */
  async updateEntry(entryId: string, updates: EntryUpdate): Promise<Entry> {
    const userId = await requireAuth(this.supabase)

    // 1. 既存エントリーを取得
    const { data: existingEntry, error: fetchError } = await this.supabase
      .from('entries')
      .select(`
        *,
        competition:competitions(*)
      `)
      .eq('id', entryId)
      .single()

    if (fetchError) throw fetchError
    if (!existingEntry) throw new Error('エントリーが見つかりません')

    // 2. アクセス制御チェック
    // エントリーの所有者かどうかチェック
    if (existingEntry.user_id === userId) {
      // 所有者の場合は更新可能
    } else if (existingEntry.team_id) {
      // チームエントリーの場合、チーム管理者かどうかチェック
      const { data: membership, error: membershipError } = await this.supabase
        .from('team_memberships')
        .select('role')
        .eq('team_id', existingEntry.team_id)
        .eq('user_id', userId)
        .eq('is_active', true)
        .single()

      if (membershipError || membership?.role !== 'admin') {
        throw new Error('アクセスが拒否されました')
      }
    } else {
      // 個人エントリーで所有者でない場合は拒否
      throw new Error('アクセスが拒否されました')
    }

    // 3. データサニタイゼーション
    // competition_idとuser_idの更新を禁止
    const sanitizedUpdates = { ...updates }
    if ('competition_id' in sanitizedUpdates) {
      throw new Error('competition_idの更新は許可されていません')
    }
    if ('user_id' in sanitizedUpdates) {
      throw new Error('user_idの更新は許可されていません')
    }

    // 4. データベース更新
    const { data, error } = await this.supabase
      .from('entries')
      .update(sanitizedUpdates)
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
   * エントリー削除（アクセス制御付き）
   * エントリーの所有者またはチーム管理者のみが削除可能
   */
  async deleteEntry(entryId: string): Promise<void> {
    const userId = await requireAuth(this.supabase)

    // 1. 既存エントリーを取得（所有者とチーム情報を含む）
    const { data: existingEntry, error: fetchError } = await this.supabase
      .from('entries')
      .select('user_id, team_id')
      .eq('id', entryId)
      .single()

    if (fetchError) throw fetchError
    if (!existingEntry) throw new Error('エントリーが見つかりません')

    // 2. アクセス制御チェック
    // エントリーの所有者かどうかチェック
    if (existingEntry.user_id === userId) {
      // 所有者の場合は削除可能
    } else if (existingEntry.team_id) {
      // チームエントリーの場合、チーム管理者かどうかチェック
      const { data: membership, error: membershipError } = await this.supabase
        .from('team_memberships')
        .select('role')
        .eq('team_id', existingEntry.team_id)
        .eq('user_id', userId)
        .eq('is_active', true)
        .single()

      if (membershipError || membership?.role !== 'admin') {
        throw new Error('アクセスが拒否されました')
      }
    } else {
      // 個人エントリーで所有者でない場合は拒否
      throw new Error('アクセスが拒否されました')
    }

    // 3. データベース削除
    const { error } = await this.supabase
      .from('entries')
      .delete()
      .eq('id', entryId)

    if (error) throw error
  }

  /**
   * 大会の全エントリーを削除（管理者のみ）
   * チーム管理者のみが実行可能
   */
  async deleteEntriesByCompetition(competitionId: string): Promise<void> {
    // 1. 大会情報を取得してチームIDを確認
    const { data: comp, error: compError } = await this.supabase
      .from('competitions')
      .select('team_id')
      .eq('id', competitionId)
      .single()

    if (compError) throw compError
    if (!comp?.team_id) throw new Error('チーム大会ではありません')

    // 2. チーム管理者権限を確認
    await requireTeamAdmin(this.supabase, comp.team_id)

    // 3. エントリー削除実行
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

