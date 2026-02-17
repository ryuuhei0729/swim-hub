// =============================================================================
// チーム管理ページデータローダー（すべてのデータを並行取得）
// =============================================================================

import React from 'react'
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import { TeamCoreAPI } from '@apps/shared/api/teams/core'
import TeamAdminClient from '../_client/TeamAdminClient'
import type { TeamMembership, TeamWithMembers } from '@apps/shared/types'
import { notFound } from 'next/navigation'

interface TeamAdminDataLoaderProps {
  teamId: string
  initialTab?: string
}

/**
 * チーム情報とメンバーシップを取得（管理者権限チェック付き）
 */
async function getTeamAdminData(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerClient>>,
  teamId: string,
  userId: string
): Promise<{
  team: TeamWithMembers | null
  membership: TeamMembership | null
}> {
  const coreAPI = new TeamCoreAPI(supabase)
  
  try {
    // チーム情報とメンバーシップ情報を並行取得
    const [teamData, { data: membershipData, error: membershipError }] = await Promise.all([
      coreAPI.getTeam(teamId),
      supabase
        .from('team_memberships')
        .select('*')
        .eq('team_id', teamId)
        .eq('user_id', userId)
        .eq('role', 'admin')
        .eq('is_active', true)
        .single()
    ])

    // 管理者権限がない場合はnullを返す
    if (membershipError || !membershipData) {
      return { team: null, membership: null }
    }

    return {
      team: teamData,
      membership: membershipData as TeamMembership
    }
  } catch (error) {
    console.error('チーム管理情報の取得に失敗:', error)
    return { team: null, membership: null }
  }
}

/**
 * チーム管理ページデータを並行取得するServer Component
 */
export default async function TeamAdminDataLoader({
  teamId,
  initialTab
}: TeamAdminDataLoaderProps) {
  // 認証情報とSupabaseクライアントを取得
  const [user, supabase] = await Promise.all([
    getServerUser(),
    createAuthenticatedServerClient()
  ])

  if (!user) {
    notFound()
  }

  // チーム情報とメンバーシップを取得（管理者権限チェック）
  const teamDataResult = await getTeamAdminData(supabase, teamId, user.id).catch((error) => {
    console.error('チーム管理データ取得エラー:', error)
    return { team: null, membership: null }
  })

  // 管理者権限がない場合は404
  if (!teamDataResult.team || !teamDataResult.membership) {
    notFound()
  }

  return (
    <TeamAdminClient
      teamId={teamId}
      initialTeam={teamDataResult.team}
      initialMembership={teamDataResult.membership}
      initialTab={initialTab}
    />
  )
}


