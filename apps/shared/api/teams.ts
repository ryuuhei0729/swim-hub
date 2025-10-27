// =============================================================================
// チームAPI - Swim Hub共通パッケージ
// Web/Mobile共通で使用するSupabase API関数
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import {
  Team,
  TeamAnnouncement,
  TeamAnnouncementInsert,
  TeamAnnouncementUpdate,
  TeamInsert,
  TeamMembership,
  TeamMembershipInsert,
  TeamMembershipWithUser,
  TeamUpdate,
  TeamWithMembers
} from '../types/database'

export class TeamAPI {
  constructor(private supabase: SupabaseClient) {}

  // =========================================================================
  // チームの操作
  // =========================================================================

  /**
   * 自分が所属するチーム一覧取得
   */
  async getMyTeams(): Promise<TeamMembershipWithUser[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('team_memberships')
      .select(`
        *,
        team:teams(*),
        user:users(*)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('joined_at', { ascending: false })

    if (error) throw error
    return data as TeamMembershipWithUser[]
  }

  /**
   * チーム詳細取得
   */
  async getTeam(teamId: string): Promise<TeamWithMembers> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // メンバーシップ確認
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
      .from('teams')
      .select(`
        *,
        team_memberships(
          *,
          user:users(*)
        )
      `)
      .eq('id', teamId)
      .single()

    if (error) throw error
    return data as TeamWithMembers
  }

  /**
   * チーム作成
   */
  async createTeam(team: Omit<TeamInsert, 'invite_code'>): Promise<Team> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // 招待コード生成
    const inviteCode = this.generateInviteCode()

    const { data, error } = await this.supabase
      .from('teams')
      .insert({ 
        ...team, 
        invite_code: inviteCode,
        created_by: user.id
      })
      .select()
      .single()

    if (error) throw error

    // 作成者を管理者として追加
    await this.createMembership({
      team_id: data.id,
      user_id: user.id,
      role: 'admin',
      is_active: true,
      joined_at: new Date().toISOString().split('T')[0] // DATE形式に変換
    } as any)

    return data
  }

  /**
   * チーム更新（管理者のみ）
   */
  async updateTeam(teamId: string, updates: TeamUpdate): Promise<Team> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // 管理者権限確認
    await this.checkAdminPermission(user.id, teamId)

    const { data, error } = await this.supabase
      .from('teams')
      .update(updates)
      .eq('id', teamId)
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * チーム削除（管理者のみ）
   */
  async deleteTeam(teamId: string): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // 管理者権限確認
    await this.checkAdminPermission(user.id, teamId)

    const { error } = await this.supabase
      .from('teams')
      .delete()
      .eq('id', teamId)

    if (error) throw error
  }

  // =========================================================================
  // チームメンバーシップの操作
  // =========================================================================

  /**
   * チームメンバー一覧取得
   */
  async getTeamMembers(teamId: string): Promise<TeamMembershipWithUser[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // メンバーシップ確認
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
      .from('team_memberships')
      .select(`
        *,
        users!team_memberships_user_id_fkey (
          name,
          birthday,
          bio
        ),
        teams!team_memberships_team_id_fkey (
          name,
          description
        )
      `)
      .eq('team_id', teamId)
      .eq('is_active', true)
      .order('joined_at', { ascending: true })

    if (error) throw error
    return data as TeamMembershipWithUser[]
  }

  /**
   * チーム参加（招待コード）
   */
  async joinTeam(inviteCode: string): Promise<TeamMembership> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // 招待コードからチーム検索
    const { data: team, error: teamError } = await this.supabase
      .from('teams')
      .select('id')
      .eq('invite_code', inviteCode)
      .single()

    if (teamError || !team) {
      throw new Error('無効な招待コードです')
    }

    // 既存メンバーシップ確認
    const { data: existing } = await this.supabase
      .from('team_memberships')
      .select('id')
      .eq('team_id', team.id)
      .eq('user_id', user.id)
      .single()

    if (existing) {
      throw new Error('既にチームに参加しています')
    }

    // メンバーシップ作成
    return await this.createMembership({
      team_id: team.id,
      user_id: user.id,
      role: 'user',
      is_active: true,
      joined_at: new Date().toISOString().split('T')[0] // DATE形式に変換
    } as any)
  }


  /**
   * メンバーシップ作成（内部用）
   */
  private async createMembership(membership: TeamMembershipInsert): Promise<TeamMembership> {
    const { data, error } = await this.supabase
      .from('team_memberships')
      .insert(membership)
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * メンバー権限更新（管理者のみ）
   */
  async updateMemberRole(
    teamId: string,
    userId: string,
    role: 'admin' | 'user'
  ): Promise<TeamMembership> {
    const { data: { user: currentUser } } = await this.supabase.auth.getUser()
    if (!currentUser) throw new Error('認証が必要です')

    // 管理者権限確認
    await this.checkAdminPermission(currentUser.id, teamId)

    const { data, error } = await this.supabase
      .from('team_memberships')
      .update({ role })
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * メンバー除名（管理者のみ）
   */
  async removeMember(teamId: string, userId: string): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // 管理者権限確認
    await this.checkAdminPermission(user.id, teamId)

    const { error } = await this.supabase
      .from('team_memberships')
      .update({
        is_active: false,
        left_at: new Date().toISOString()
      })
      .eq('team_id', teamId)
      .eq('user_id', userId)

    if (error) throw error
  }

  // =========================================================================
  // チームお知らせの操作
  // =========================================================================

  /**
   * チームお知らせ一覧取得
   */
  async getTeamAnnouncements(teamId: string): Promise<TeamAnnouncement[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // メンバーシップ確認
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

    // 管理者は全て、一般ユーザーは公開済みのみ
    let query = this.supabase
      .from('announcements')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })

    if (membership.role !== 'admin') {
      query = query.eq('is_published', true)
    }

    const { data, error } = await query

    if (error) throw error
    return data
  }

  /**
   * お知らせ作成（管理者のみ）
   */
  async createAnnouncement(
    announcement: Omit<TeamAnnouncementInsert, 'created_by'>
  ): Promise<TeamAnnouncement> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // 管理者権限確認
    await this.checkAdminPermission(user.id, announcement.team_id)

    const { data, error } = await this.supabase
      .from('announcements')
      .insert({ ...announcement, created_by: user.id })
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * お知らせ更新（作成者または管理者のみ）
   */
  async updateAnnouncement(
    id: string,
    updates: TeamAnnouncementUpdate
  ): Promise<TeamAnnouncement> {
    const { data, error } = await this.supabase
      .from('announcements')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * お知らせ削除（作成者または管理者のみ）
   */
  async deleteAnnouncement(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('announcements')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  // =========================================================================
  // ヘルパー関数
  // =========================================================================

  /**
   * 管理者権限チェック
   */
  private async checkAdminPermission(userId: string, teamId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('team_memberships')
      .select('role, is_active')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (error || !data || data.role !== 'admin') {
      throw new Error('管理者権限が必要です')
    }
  }

  /**
   * 招待コード生成
   */
  private generateInviteCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = ''
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

  // =========================================================================
  // リアルタイム購読
  // =========================================================================

  /**
   * チームお知らせの変更をリアルタイム購読
   */
  subscribeToAnnouncements(teamId: string, callback: (announcement: TeamAnnouncement) => void) {
    return this.supabase
      .channel(`team-announcements-${teamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'announcements',
          filter: `team_id=eq.${teamId}`
        },
        (payload) => {
          if (payload.new) {
            callback(payload.new as TeamAnnouncement)
          }
        }
      )
      .subscribe()
  }

  /**
   * チームメンバーの変更をリアルタイム購読
   */
  subscribeToMembers(teamId: string, callback: (membership: TeamMembership) => void) {
    return this.supabase
      .channel(`team-members-${teamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_memberships',
          filter: `team_id=eq.${teamId}`
        },
        (payload) => {
          if (payload.new) {
            callback(payload.new as TeamMembership)
          }
        }
      )
      .subscribe()
  }

  /**
   * 現在のユーザーがチームから退出
   */
  async leaveTeam(teamId: string): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { error } = await this.supabase
      .from('team_memberships')
      .update({ is_active: false })
      .eq('team_id', teamId)
      .eq('user_id', user.id)

    if (error) throw error
  }

  /**
   * チーム練習記録を作成
   */
  async createTeamPractice(teamId: string, practiceData: {
    date: string
    place?: string | null
    note?: string | null
  }): Promise<string> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('practices')
      .insert({
        user_id: user.id, // 作成者は現在のユーザー
        team_id: teamId,
        date: practiceData.date,
        place: practiceData.place,
        note: practiceData.note,
        created_by: user.id
      })
      .select('id')
      .single()

    if (error) throw error
    return data.id
  }

  /**
   * チーム練習ログを作成（メンバー一括用）
   */
  async createTeamPracticeLog(practiceId: string, userId: string, logData: {
    style: string
    distance: number
    times: number[]
  }): Promise<string> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // PracticeLogを作成
    const { data: practiceLog, error: logError } = await this.supabase
      .from('practice_logs')
      .insert({
        practice_id: practiceId,
        user_id: userId,
        style: logData.style,
        distance: logData.distance
      })
      .select('id')
      .single()

    if (logError) throw logError

    // PracticeTimeを作成
    const practiceTimes = logData.times.map(time => ({
      practice_log_id: practiceLog.id,
      time: time
    }))

    const { error: timesError } = await this.supabase
      .from('practice_times')
      .insert(practiceTimes)

    if (timesError) throw timesError

    return practiceLog.id
  }

  /**
   * チームの管理者数を取得
   */
  async getAdminCount(teamId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('team_memberships')
      .select('id')
      .eq('team_id', teamId)
      .eq('role', 'admin')
      .eq('is_active', true)

    if (error) throw error
    return data.length
  }

  /**
   * 現在のユーザーが管理者かどうかチェック
   */
  async isCurrentUserAdmin(teamId: string): Promise<boolean> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) return false

    const { data, error } = await this.supabase
      .from('team_memberships')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (error) return false
    return data.role === 'admin'
  }

  /**
   * チームの総メンバー数を取得
   */
  async getTotalMemberCount(teamId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('team_memberships')
      .select('id')
      .eq('team_id', teamId)
      .eq('is_active', true)

    if (error) throw error
    return data.length
  }

  /**
   * チーム大会を作成
   */
  async createTeamCompetition(teamId: string, competitionData: {
    title: string
    date: string
    place?: string | null
    note?: string | null
  }): Promise<string> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // 管理者権限確認
    await this.checkAdminPermission(user.id, teamId)

    const { data, error } = await this.supabase
      .from('competitions')
      .insert({
        user_id: user.id,
        team_id: teamId,
        title: competitionData.title,
        date: competitionData.date,
        place: competitionData.place,
        note: competitionData.note,
        created_by: user.id
      })
      .select('id')
      .single()

    if (error) throw error
    return data.id
  }

  // =========================================================================
  // エントリー管理
  // =========================================================================

  /**
   * 大会のエントリーステータスを更新（管理者専用）
   */
  async updateCompetitionEntryStatus(
    competitionId: string,
    entryStatus: 'before' | 'open' | 'closed'
  ): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // 大会情報を取得してteam_idを確認
    const { data: competition, error: competitionError } = await this.supabase
      .from('competitions')
      .select('team_id')
      .eq('id', competitionId)
      .single()

    if (competitionError) throw competitionError
    if (!competition?.team_id) throw new Error('チーム大会ではありません')

    // 管理者権限を確認
    const { data: membership, error: membershipError } = await this.supabase
      .from('team_memberships')
      .select('role')
      .eq('team_id', competition.team_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (membershipError) throw membershipError
    if (membership.role !== 'admin') throw new Error('管理者権限が必要です')

    // エントリーステータスを更新
    const { error } = await this.supabase
      .from('competitions')
      .update({ entry_status: entryStatus })
      .eq('id', competitionId)

    if (error) throw error
  }

  /**
   * 大会のエントリー集計（種目別）
   */
  async getCompetitionEntries(competitionId: string) {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // 大会情報を取得
    const { data: competition, error: competitionError } = await this.supabase
      .from('competitions')
      .select('team_id, title, date, place, entry_status')
      .eq('id', competitionId)
      .single()

    if (competitionError) throw competitionError
    if (!competition?.team_id) throw new Error('チーム大会ではありません')

    // チームメンバーかどうか確認
    const { data: membership, error: membershipError } = await this.supabase
      .from('team_memberships')
      .select('role')
      .eq('team_id', competition.team_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (membershipError) throw membershipError

    // エントリー一覧を取得（種目・ユーザー情報付き）
    const { data: entries, error: entriesError } = await this.supabase
      .from('entries')
      .select(`
        id,
        user_id,
        style_id,
        entry_time,
        note,
        created_at,
        users!entries_user_id_fkey (
          id,
          name
        ),
        styles (
          id,
          name_jp,
          distance
        )
      `)
      .eq('competition_id', competitionId)
      .eq('team_id', competition.team_id)
      .order('style_id', { ascending: true })
      .order('entry_time', { ascending: true, nullsFirst: false })

    if (entriesError) throw entriesError

    // 種目別にグルーピング
    const entriesByStyle = (entries || []).reduce((acc, entry) => {
      const styleId = entry.style_id
      if (!acc[styleId]) {
        acc[styleId] = {
          style: entry.styles,
          entries: []
        }
      }
      acc[styleId].entries.push({
        id: entry.id,
        user: entry.users,
        entry_time: entry.entry_time,
        note: entry.note,
        created_at: entry.created_at
      })
      return acc
    }, {} as Record<number, any>)

    return {
      competition,
      isAdmin: membership.role === 'admin',
      entriesByStyle,
      totalEntries: entries?.length || 0
    }
  }

  /**
   * エントリー受付中の大会一覧取得
   */
  async getOpenCompetitions(teamId: string) {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // チームメンバーかどうか確認
    const { data: membership, error: membershipError } = await this.supabase
      .from('team_memberships')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (membershipError) throw membershipError

    // entry_status='open'の大会を取得
    const { data: competitions, error: competitionsError } = await this.supabase
      .from('competitions')
      .select('id, title, date, place, pool_type, entry_status, note')
      .eq('team_id', teamId)
      .eq('entry_status', 'open')
      .order('date', { ascending: true })

    if (competitionsError) throw competitionsError

    return {
      competitions: competitions || [],
      isAdmin: membership.role === 'admin'
    }
  }

  /**
   * 特定の大会における現在のユーザーのエントリー一覧取得
   */
  async getUserEntriesForCompetition(competitionId: string) {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // 大会情報を取得
    const { data: competition, error: competitionError } = await this.supabase
      .from('competitions')
      .select('team_id, title, date, place, entry_status')
      .eq('id', competitionId)
      .single()

    if (competitionError) throw competitionError
    if (!competition?.team_id) throw new Error('チーム大会ではありません')

    // チームメンバーかどうか確認
    const { data: membership, error: membershipError } = await this.supabase
      .from('team_memberships')
      .select('id')
      .eq('team_id', competition.team_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (membershipError) throw membershipError

    // 自分のエントリー一覧を取得
    const { data: entries, error: entriesError } = await this.supabase
      .from('entries')
      .select(`
        id,
        user_id,
        style_id,
        entry_time,
        note,
        created_at,
        styles (
          id,
          name_jp,
          distance
        )
      `)
      .eq('competition_id', competitionId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (entriesError) throw entriesError

    return entries || []
  }
}

