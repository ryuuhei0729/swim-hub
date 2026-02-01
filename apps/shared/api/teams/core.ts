// =============================================================================
// チームAPI - core（チーム基本情報/作成更新/削除/可視性）
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { Team, TeamInsert, TeamMembershipWithUser, TeamUpdate, TeamWithMembers } from '../../types'
import { requireAuth, requireTeamMembership } from '../auth-utils'

export class TeamCoreAPI {
  constructor(private supabase: SupabaseClient) {}

  // NOTE: 実体は既存 teams.ts から段階的に移行する
  async getMyTeams(): Promise<TeamMembershipWithUser[]> {
    const userId = await requireAuth(this.supabase)
    // 承認済み（status='approved' && is_active=true）と承認待ち（status='pending'）の両方を取得
    // RLSポリシーにより、自分のメンバーシップ（user_id = auth.uid()）は全て取得可能
    // 承認済みの場合はis_active=trueのみ、承認待ちの場合はis_activeの条件なし
    const { data, error } = await this.supabase
      .from('team_memberships')
      .select(`*, teams:teams(*), users:users(*)`)
      .eq('user_id', userId)
      .in('status', ['approved', 'pending'])
      .order('joined_at', { ascending: false })
    if (error) throw error
    
    // 承認済みの場合はis_active=trueのみを返す
    // 承認待ちの場合はis_activeの条件なし
    return (data as TeamMembershipWithUser[]).filter(
      (membership) => 
        membership.status === 'pending' || 
        (membership.status === 'approved' && membership.is_active === true)
    )
  }

  async getTeam(teamId: string): Promise<TeamWithMembers> {
    await requireTeamMembership(this.supabase, teamId)

    const { data, error } = await this.supabase
      .from('teams')
      .select(`*, team_memberships(*, user:users(*))`)
      .eq('id', teamId)
      .single()
    if (error) throw error
    return data as TeamWithMembers
  }

  async createTeam(input: TeamInsert): Promise<Team> {
    const userId = await requireAuth(this.supabase)

    // created_byを含む挿入データを作成
    const insertData = {
      ...input,
      created_by: userId
    }

    const { data, error } = await this.supabase
      .from('teams')
      .insert(insertData)
      .select('*')
      .single()
    if (error) throw error

    // チーム作成者を自動的にadminとしてメンバーシップに追加（承認済み状態で）
    const { error: membershipError } = await this.supabase
      .from('team_memberships')
      .insert({
        team_id: data.id,
        user_id: userId,
        role: 'admin',
        status: 'approved',
        is_active: true,
        joined_at: new Date().toISOString().split('T')[0]
      })
    
    if (membershipError) {
      console.error('チームメンバーシップの作成に失敗:', membershipError)
      // チームは作成されたが、メンバーシップの作成に失敗した場合はエラーを投げる
      throw new Error('チームの作成に成功しましたが、メンバーシップの追加に失敗しました')
    }
    
    return data as Team
  }

  async updateTeam(id: string, updates: TeamUpdate): Promise<Team> {
    const { data, error } = await this.supabase
      .from('teams')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Team
  }

  async deleteTeam(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('teams')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
}

export type { Team, TeamInsert, TeamUpdate, TeamWithMembers }


