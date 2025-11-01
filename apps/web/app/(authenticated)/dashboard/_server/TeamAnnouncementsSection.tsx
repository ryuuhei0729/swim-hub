// =============================================================================
// チームお知らせ取得用Server Component
// =============================================================================

import React from 'react'
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import type { TeamMembership, Team } from '@apps/shared/types/database'

interface TeamMembershipWithTeam extends TeamMembership {
  team?: Team
}

interface TeamAnnouncementsSectionProps {
  children: (data: {
    teams: TeamMembershipWithTeam[]
  }) => React.ReactNode
}

/**
 * チーム情報とお知らせをサーバー側で取得するServer Component
 * Suspenseでラップして使用してください
 */
export default async function TeamAnnouncementsSection({
  children
}: TeamAnnouncementsSectionProps) {
  const user = await getServerUser()
  
  if (!user) {
    // ユーザーが認証されていない場合は空配列を返す
    return <>{children({ teams: [] })}</>
  }

  const supabase = await createAuthenticatedServerClient()

  try {
    // チームメンバーシップを取得（チーム情報を含む）
    const { data: memberships, error: membershipError } = await supabase
      .from('team_memberships')
      .select(`
        *,
        team:teams (
          id,
          name,
          description
        )
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (membershipError) {
      console.error('チーム情報の取得に失敗:', membershipError)
      return <>{children({ teams: [] })}</>
    }

    const teams = (memberships || []) as TeamMembershipWithTeam[]

    return <>{children({ teams })}</>
  } catch (error) {
    console.error('チームお知らせセクションのエラー:', error)
    return <>{children({ teams: [] })}</>
  }
}

