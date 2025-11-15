// =============================================================================
// チームAPI - core（チーム基本情報/作成更新/削除/可視性）
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { Team, TeamInsert, TeamMembershipWithUser, TeamUpdate, TeamWithMembers } from '../../types/database'

export class TeamCoreAPI {
  constructor(private supabase: SupabaseClient) {}

  // NOTE: 実体は既存 teams.ts から段階的に移行する
  async getMyTeams(): Promise<TeamMembershipWithUser[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')
    const { data, error } = await this.supabase
      .from('team_memberships')
      .select(`*, teams:teams(*), users:users(*)`)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('joined_at', { ascending: false })
    if (error) throw error
    return data as TeamMembershipWithUser[]
  }

  async getTeam(teamId: string): Promise<TeamWithMembers> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data: membership } = await this.supabase
      .from('team_memberships')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()
    if (!membership) throw new Error('チームへのアクセス権限がありません')

    const { data, error } = await this.supabase
      .from('teams')
      .select(`*, team_memberships(*, user:users(*))`)
      .eq('id', teamId)
      .single()
    if (error) throw error
    return data as TeamWithMembers
  }

  async createTeam(input: TeamInsert): Promise<Team> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')
    const { data, error } = await this.supabase
      .from('teams')
      .insert(input)
      .select('*')
      .single()
    if (error) throw error
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


