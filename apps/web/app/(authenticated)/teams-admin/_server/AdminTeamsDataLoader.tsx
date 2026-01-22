// =============================================================================
// 管理者チーム一覧データローダー（すべてのデータを並行取得）
// =============================================================================

import React from 'react'
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import AdminTeamsClient from '../_client/AdminTeamsClient'
import type { TeamMembershipWithUser } from '@apps/shared/types'

/**
 * 管理者権限を持つチーム一覧を取得
 */
async function getAdminTeams(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerClient>>
): Promise<TeamMembershipWithUser[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('認証が必要です')
  
  const { data, error } = await supabase
    .from('team_memberships')
    .select(`*, teams:teams(*), users:users(*)`)
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .eq('is_active', true)
    .order('joined_at', { ascending: false })
  
  if (error) throw error
  return data as TeamMembershipWithUser[]
}

/**
 * 管理者チーム一覧ページデータを並行取得するServer Component
 */
export default async function AdminTeamsDataLoader() {
  // 認証情報とSupabaseクライアントを取得
  const [user, supabase] = await Promise.all([
    getServerUser(),
    createAuthenticatedServerClient()
  ])

  if (!user) {
    return (
      <AdminTeamsClient
        initialTeams={[]}
      />
    )
  }

  // 管理者権限を持つチーム一覧を取得
  const teamsResult = await getAdminTeams(supabase).catch((error) => {
    console.error('管理者チーム情報取得エラー:', error)
    return [] as TeamMembershipWithUser[]
  })

  return (
    <AdminTeamsClient
      initialTeams={teamsResult}
    />
  )
}


