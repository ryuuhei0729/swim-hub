// =============================================================================
// チームデータローダー（すべてのデータを並行取得）
// =============================================================================

import React from 'react'
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import { TeamCoreAPI } from '@apps/shared/api/teams/core'
import TeamsClient from '../_client/TeamsClient'
import type { TeamMembershipWithUser } from '@apps/shared/types/database'

/**
 * チーム情報を取得
 */
async function getTeams(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerClient>>,
  userId: string
): Promise<TeamMembershipWithUser[]> {
  const coreAPI = new TeamCoreAPI(supabase)
  return await coreAPI.getMyTeams()
}

/**
 * すべてのチームページデータを並行取得するServer Component
 * Waterfall問題を完全に解消
 */
export default async function TeamsDataLoader() {
  // 認証情報とSupabaseクライアントを取得
  const [user, supabase] = await Promise.all([
    getServerUser(),
    createAuthenticatedServerClient()
  ])

  // チーム情報取得（認証必要）
  const teamsResult = user
    ? await getTeams(supabase, user.id).catch((error) => {
        console.error('チーム情報取得エラー:', error)
        return [] as TeamMembershipWithUser[]
      })
    : ([] as TeamMembershipWithUser[])

  return (
    <TeamsClient
      initialTeams={teamsResult}
    />
  )
}

