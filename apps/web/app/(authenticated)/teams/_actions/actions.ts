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

