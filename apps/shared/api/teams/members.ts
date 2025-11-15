// =============================================================================
// チームAPI - members（メンバーシップCRUD/ロール/アクティブ管理）
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { TeamMembership, TeamMembershipInsert, TeamMembershipWithUser } from '../../types/database'

export class TeamMembersAPI {
  constructor(private supabase: SupabaseClient) {}

  async list(teamId: string): Promise<TeamMembershipWithUser[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')
    const { data, error } = await this.supabase
      .from('team_memberships')
      .select('*, users:users(*), teams:teams(*)')
      .eq('team_id', teamId)
      .eq('is_active', true)
    if (error) throw error
    return data as unknown as TeamMembershipWithUser[]
  }

  async join(inviteCode: string): Promise<TeamMembership> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data: team } = await this.supabase
      .from('teams')
      .select('id, invite_code')
      .eq('invite_code', inviteCode)
      .single()
    if (!team) throw new Error('招待コードが無効です')

    const input: TeamMembershipInsert = {
      team_id: team.id,
      user_id: user.id,
      role: 'user',
      member_type: null,
      group_name: null,
      is_active: true,
      joined_at: new Date().toISOString(),
      left_at: null
    }

    const { data: membership, error } = await this.supabase
      .from('team_memberships')
      .insert(input)
      .select('*')
      .single()
    if (error) throw error
    return membership as TeamMembership
  }

  async leave(teamId: string): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')
    const { error } = await this.supabase
      .from('team_memberships')
      .update({ is_active: false, left_at: new Date().toISOString() })
      .eq('team_id', teamId)
      .eq('user_id', user.id)
    if (error) throw error
  }

  async updateRole(teamId: string, userId: string, role: 'admin' | 'user'): Promise<TeamMembership> {
    const { data, error } = await this.supabase
      .from('team_memberships')
      .update({ role })
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .select('*')
      .single()
    if (error) throw error
    return data as TeamMembership
  }

  async remove(teamId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('team_memberships')
      .update({ is_active: false, left_at: new Date().toISOString() })
      .eq('team_id', teamId)
      .eq('user_id', userId)
    if (error) throw error
  }
}

export type { TeamMembership }


