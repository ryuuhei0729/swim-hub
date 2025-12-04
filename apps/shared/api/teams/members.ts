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
      .eq('status', 'approved')
      .eq('is_active', true)
    if (error) throw error
    return data as unknown as TeamMembershipWithUser[]
  }

  async join(inviteCode: string): Promise<TeamMembership> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // 招待コードでチームを安全に検索（RPC関数を使用）
    const { data: team, error: teamError } = await this.supabase
      .rpc('find_team_by_invite_code', { p_invite_code: inviteCode })
      .single<{ id: string; invite_code: string }>()
    
    if (teamError) {
      if (teamError.code === 'PGRST116') {
        throw new Error('招待コードが正しくありません')
      }
      throw teamError
    }
    
    if (!team || !team.id) throw new Error('招待コードが無効です')

    // 既に参加しているかチェック
    const { data: existingMembership, error: membershipError } = await this.supabase
      .from('team_memberships')
      .select('id, is_active, status')
      .eq('team_id', team.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError && membershipError.code !== 'PGRST116') {
      throw membershipError
    }

    // 既存のメンバーシップがある場合
    if (existingMembership) {
      // 承認済みでアクティブな場合は既に参加している
      if (existingMembership.status === 'approved' && existingMembership.is_active) {
        throw new Error('既にこのチームに参加しています')
      }
      // 承認待ちの場合は既に申請済み
      if (existingMembership.status === 'pending') {
        throw new Error('既に参加申請中です。承認をお待ちください')
      }
      // 拒否された場合は再申請（pendingに更新）
      if (existingMembership.status === 'rejected') {
        const { data: updated, error: updateError } = await this.supabase
          .from('team_memberships')
          .update({
            status: 'pending',
            is_active: false,
            joined_at: new Date().toISOString(),
            left_at: null
          })
          .eq('id', existingMembership.id)
          .select('*')
          .single()
        if (updateError) throw updateError
        return updated as TeamMembership
      }
      // 非アクティブな承認済みメンバーシップを再アクティブ化
      if (existingMembership.status === 'approved' && !existingMembership.is_active) {
        const joinedAt = new Date().toISOString().split('T')[0]
        return await this.reactivateMembership(existingMembership.id, joinedAt)
      }
    }

    // 新しいメンバーシップを作成（承認待ち）
    const input: TeamMembershipInsert = {
      team_id: team.id,
      user_id: user.id,
      role: 'user',
      member_type: null,
      group_name: null,
      status: 'pending',
      is_active: false,
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

  /**
   * 非アクティブなメンバーシップを再アクティブ化
   */
  async reactivateMembership(membershipId: string, joinedAt: string): Promise<TeamMembership> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // メンバーシップが存在し、現在のユーザーのものであることを確認
    const { data: membership, error: fetchError } = await this.supabase
      .from('team_memberships')
      .select('id, user_id, team_id')
      .eq('id', membershipId)
      .single()

    if (fetchError) throw fetchError
    if (!membership) throw new Error('メンバーシップが見つかりません')
    if (membership.user_id !== user.id) {
      throw new Error('自分のメンバーシップのみ再アクティブ化できます')
    }

    // 再アクティブ化
    const { data: updated, error } = await this.supabase
      .from('team_memberships')
      .update({ 
        status: 'approved',
        is_active: true, 
        joined_at: joinedAt,
        left_at: null
      })
      .eq('id', membershipId)
      .select('*')
      .single()

    if (error) throw error
    return updated as TeamMembership
  }

  /**
   * 承認待ちのメンバーシップ一覧を取得（管理者のみ）
   */
  async listPending(teamId: string): Promise<TeamMembershipWithUser[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')
    
    const { data, error } = await this.supabase
      .from('team_memberships')
      .select('*, users:users(*), teams:teams(*)')
      .eq('team_id', teamId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data as unknown as TeamMembershipWithUser[]
  }

  /**
   * 承認待ちのメンバーシップ数を取得（管理者のみ）
   */
  async countPending(teamId: string): Promise<number> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')
    
    const { count, error } = await this.supabase
      .from('team_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('status', 'pending')
    
    if (error) throw error
    return count || 0
  }

  /**
   * メンバーシップを承認
   */
  async approve(membershipId: string): Promise<TeamMembership> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // メンバーシップを取得してチームIDを確認
    const { data: membership, error: fetchError } = await this.supabase
      .from('team_memberships')
      .select('id, team_id, status')
      .eq('id', membershipId)
      .single()

    if (fetchError) throw fetchError
    if (!membership) throw new Error('メンバーシップが見つかりません')
    if (membership.status !== 'pending') {
      throw new Error('承認待ちのメンバーシップのみ承認できます')
    }

    // 承認
    const { data: updated, error } = await this.supabase
      .from('team_memberships')
      .update({
        status: 'approved',
        is_active: true,
        joined_at: new Date().toISOString(),
        left_at: null
      })
      .eq('id', membershipId)
      .select('*')
      .single()

    if (error) throw error
    return updated as TeamMembership
  }

  /**
   * メンバーシップを拒否
   */
  async reject(membershipId: string): Promise<TeamMembership> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // メンバーシップを取得してチームIDを確認
    const { data: membership, error: fetchError } = await this.supabase
      .from('team_memberships')
      .select('id, team_id, status')
      .eq('id', membershipId)
      .single()

    if (fetchError) throw fetchError
    if (!membership) throw new Error('メンバーシップが見つかりません')
    if (membership.status !== 'pending') {
      throw new Error('承認待ちのメンバーシップのみ拒否できます')
    }

    // 拒否
    const { data: updated, error } = await this.supabase
      .from('team_memberships')
      .update({
        status: 'rejected',
        is_active: false
      })
      .eq('id', membershipId)
      .select('*')
      .single()

    if (error) throw error
    return updated as TeamMembership
  }
}

export type { TeamMembership }


