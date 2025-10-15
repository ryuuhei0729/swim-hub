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
      .insert({ ...team, invite_code: inviteCode })
      .select()
      .single()

    if (error) throw error

    // 作成者を管理者として追加
    await this.createMembership({
      team_id: data.id,
      user_id: user.id,
      role: 'admin',
      is_active: true,
      joined_at: new Date().toISOString()
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
        user:users(*),
        team:teams(*)
      `)
      .eq('team_id', teamId)
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
      joined_at: new Date().toISOString()
    } as any)
  }

  /**
   * チーム脱退
   */
  async leaveTeam(teamId: string): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { error } = await this.supabase
      .from('team_memberships')
      .update({
        is_active: false,
        left_at: new Date().toISOString()
      })
      .eq('team_id', teamId)
      .eq('user_id', user.id)

    if (error) throw error
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
}

