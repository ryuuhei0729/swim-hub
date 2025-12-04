'use server'

import { createAuthenticatedServerClient } from '@/lib/supabase-server-auth'
import { TeamMembersAPI } from '@apps/shared/api/teams/members'
import { revalidatePath } from 'next/cache'

/**
 * チームに参加するServer Action
 */
export async function joinTeam(inviteCode: string) {
  const supabase = await createAuthenticatedServerClient()
  const api = new TeamMembersAPI(supabase)
  
  try {
    const membership = await api.join(inviteCode)
    
    // キャッシュを無効化
    revalidatePath('/teams')
    
    return { success: true, membership }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'チームの参加に失敗しました'
    return { success: false, error: message }
  }
}

/**
 * 非アクティブなメンバーシップを再アクティブ化するServer Action
 */
export async function reactivateTeamMembership(membershipId: string, joinedAt: string) {
  const supabase = await createAuthenticatedServerClient()
  const api = new TeamMembersAPI(supabase)
  
  try {
    const membership = await api.reactivateMembership(membershipId, joinedAt)
    
    // キャッシュを無効化
    revalidatePath('/teams')
    
    return { success: true, membership }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'メンバーシップの再アクティブ化に失敗しました'
    return { success: false, error: message }
  }
}

/**
 * メンバーシップを承認するServer Action
 */
export async function approveMembership(membershipId: string, teamId: string) {
  const supabase = await createAuthenticatedServerClient()
  const api = new TeamMembersAPI(supabase)
  
  try {
    const membership = await api.approve(membershipId)
    
    // キャッシュを無効化
    revalidatePath('/teams')
    revalidatePath(`/teams-admin/${teamId}`)
    
    return { success: true, membership }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'メンバーシップの承認に失敗しました'
    return { success: false, error: message }
  }
}

/**
 * メンバーシップを拒否するServer Action
 */
export async function rejectMembership(membershipId: string, teamId: string) {
  const supabase = await createAuthenticatedServerClient()
  const api = new TeamMembersAPI(supabase)
  
  try {
    const membership = await api.reject(membershipId)
    
    // キャッシュを無効化
    revalidatePath('/teams')
    revalidatePath(`/teams-admin/${teamId}`)
    
    return { success: true, membership }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'メンバーシップの拒否に失敗しました'
    return { success: false, error: message }
  }
}

