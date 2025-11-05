// =============================================================================
// チーム詳細データローダー（すべてのデータを並行取得）
// =============================================================================

import React from 'react'
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import { TeamCoreAPI } from '@apps/shared/api/teams/core'
import TeamDetailClient from '../_client/TeamDetailClient'
import type { Team, TeamMembership, TeamWithMembers } from '@apps/shared/types/database'

interface TeamDetailDataLoaderProps {
  teamId: string
  initialTab?: string
}

/**
 * チーム情報とメンバーシップを取得
 */
async function getTeamData(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerClient>>,
  teamId: string,
  userId: string
): Promise<{
  team: Team | null
  membership: TeamMembership | null
}> {
  const coreAPI = new TeamCoreAPI(supabase)
  
  try {
    // チーム情報を取得（メンバー情報も含む）
    const teamData = await coreAPI.getTeam(teamId)
    
    // 現在のユーザーのメンバーシップ情報を取得
    const { data: membershipData, error: membershipError } = await supabase
      .from('team_memberships')
      .select('*')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    // メンバーシップが見つからない場合はnullを返す（エラーではない）
    if (membershipError && membershipError.code !== 'PGRST116') {
      throw membershipError
    }

    return {
      team: teamData as Team,
      membership: membershipData as TeamMembership | null
    }
  } catch (error) {
    console.error('チーム情報の取得に失敗:', error)
    return { team: null, membership: null }
  }
}

/**
 * すべてのチーム詳細ページデータを並行取得するServer Component
 * Waterfall問題を完全に解消
 */
export default async function TeamDetailDataLoader({
  teamId,
  initialTab
}: TeamDetailDataLoaderProps) {
  // 認証情報とSupabaseクライアントを取得
  const [user, supabase] = await Promise.all([
    getServerUser(),
    createAuthenticatedServerClient()
  ])

  if (!user) {
    return (
      <TeamDetailClient
        teamId={teamId}
        initialTeam={null}
        initialMembership={null}
        initialTab={initialTab}
      />
    )
  }

  // チーム情報とメンバーシップを取得
  const teamDataResult = await getTeamData(supabase, teamId, user.id).catch((error) => {
    console.error('チームデータ取得エラー:', error)
    return { team: null, membership: null }
  })

  return (
    <TeamDetailClient
      teamId={teamId}
      initialTeam={teamDataResult.team}
      initialMembership={teamDataResult.membership}
      initialTab={initialTab}
    />
  )
}

