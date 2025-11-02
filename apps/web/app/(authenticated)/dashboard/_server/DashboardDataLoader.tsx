// =============================================================================
// ダッシュボードデータローダー（すべてのデータを並行取得）
// =============================================================================

import React from 'react'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import { DashboardAPI } from '@apps/shared/api/dashboard'
import { StyleAPI } from '@apps/shared/api/styles'
import { endOfMonth, startOfMonth } from 'date-fns'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import DashboardClient from '../_client/DashboardClient'
import type { Style, PracticeTag, TeamMembership, Team } from '@apps/shared/types/database'
import type { CalendarItem, MonthlySummary } from '@apps/shared/types/ui'
import type { Database } from '@/lib/supabase'

interface TeamMembershipWithTeam extends TeamMembership {
  team?: Team
}

/**
 * Stylesデータをキャッシュ付きで取得
 * Stylesは全ユーザー共通の静的データなので、長時間キャッシュ可能
 */
async function getCachedStyles() {
  return unstable_cache(
    async () => {
      const supabase = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const styleAPI = new StyleAPI(supabase)
      return await styleAPI.getStyles()
    },
    ['dashboard-styles'],
    {
      revalidate: 3600,
      tags: ['styles']
    }
  )()
}

/**
 * Tagsデータを取得
 * Tagsはユーザー固有で頻繁に変更される可能性があるため、キャッシュは使用しない
 */
async function getTags(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerClient>>,
  userId: string
): Promise<PracticeTag[]> {
  const { data, error } = await supabase
    .from('practice_tags')
    .select('*')
    .eq('user_id', userId)
    .order('name')

  if (error) {
    console.error('Tags取得エラー:', error)
    return []
  }

  return (data || []) as PracticeTag[]
}

/**
 * チーム情報を取得
 */
async function getTeams(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerClient>>,
  userId: string
): Promise<TeamMembershipWithTeam[]> {
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
    .eq('user_id', userId)
    .eq('is_active', true)

  if (membershipError) {
    console.error('チーム情報の取得に失敗:', membershipError)
    return []
  }

  return (memberships || []) as TeamMembershipWithTeam[]
}

/**
 * カレンダーデータを取得
 */
async function getCalendarData(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerClient>>,
  currentDate: Date = new Date()
): Promise<{
  calendarItems: CalendarItem[]
  monthlySummary: MonthlySummary
}> {
  const api = new DashboardAPI(supabase)

  // タイムゾーンを考慮した日付変換（日本時間 'Asia/Tokyo'）
  const TIMEZONE = 'Asia/Tokyo'
  const zonedDate = toZonedTime(currentDate, TIMEZONE)

  // 月の開始日と終了日を計算（タイムゾーン考慮済み）
  const monthStart = startOfMonth(zonedDate)
  const monthEnd = endOfMonth(zonedDate)
  const startDate = formatInTimeZone(monthStart, TIMEZONE, 'yyyy-MM-dd')
  const endDate = formatInTimeZone(monthEnd, TIMEZONE, 'yyyy-MM-dd')

  // 並行取得でパフォーマンス最適化
  const [calendarItems, monthlySummary] = await Promise.all([
    api.getCalendarEntries(startDate, endDate),
    api.getMonthlySummary(zonedDate.getFullYear(), zonedDate.getMonth() + 1)
  ])

  return { calendarItems, monthlySummary }
}

/**
 * すべてのダッシュボードデータを並行取得するServer Component
 * Waterfall問題を完全に解消
 */
export default async function DashboardDataLoader({
  currentDate = new Date()
}: {
  currentDate?: Date
}) {
  // 認証情報とSupabaseクライアントを取得
  const [user, supabase] = await Promise.all([
    getServerUser(),
    createAuthenticatedServerClient()
  ])

  // すべてのデータ取得を並行実行（真の並列取得）
  const [stylesResult, tagsResult, teamsResult, calendarResult] = await Promise.all([
    // Styles取得（キャッシュ付き、認証不要）
    getCachedStyles().catch((error) => {
      console.error('Styles取得エラー:', error)
      return [] as Style[]
    }),
    // Tags取得（ユーザー固有、認証必要）
    user
      ? getTags(supabase, user.id).catch((error) => {
          console.error('Tags取得エラー:', error)
          return [] as PracticeTag[]
        })
      : Promise.resolve([] as PracticeTag[]),
    // チーム情報取得（認証必要）
    user
      ? getTeams(supabase, user.id).catch((error) => {
          console.error('チーム情報取得エラー:', error)
          return [] as TeamMembershipWithTeam[]
        })
      : Promise.resolve([] as TeamMembershipWithTeam[]),
    // カレンダーデータ取得（認証必要）
    user
      ? getCalendarData(supabase, currentDate).catch((error) => {
          console.error('カレンダーデータ取得エラー:', error)
          return {
            calendarItems: [] as CalendarItem[],
            monthlySummary: { practiceCount: 0, recordCount: 0 } as MonthlySummary
          }
        })
      : Promise.resolve({
          calendarItems: [] as CalendarItem[],
          monthlySummary: { practiceCount: 0, recordCount: 0 } as MonthlySummary
        })
  ])

  return (
    <DashboardClient
      initialCalendarItems={calendarResult.calendarItems}
      initialMonthlySummary={calendarResult.monthlySummary}
      teams={teamsResult}
      styles={stylesResult}
      tags={tagsResult}
    />
  )
}

