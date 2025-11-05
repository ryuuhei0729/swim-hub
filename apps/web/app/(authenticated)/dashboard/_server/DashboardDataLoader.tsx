// =============================================================================
// ダッシュボードデータローダー（すべてのデータを並行取得）
// =============================================================================

import React from 'react'
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import { DashboardAPI } from '@apps/shared/api/dashboard'
import { getCachedStyles, getUserTags, getUserTeams } from '@/lib/data-loaders/common'
import { endOfMonth, startOfMonth } from 'date-fns'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import DashboardClient from '../_client/DashboardClient'
import type { Style, PracticeTag, TeamMembership, Team } from '@apps/shared/types/database'
import type { CalendarItem, MonthlySummary } from '@apps/shared/types/ui'

interface TeamMembershipWithTeam extends TeamMembership {
  team?: Team
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
    getCachedStyles('dashboard-styles').catch((error) => {
      console.error('Styles取得エラー:', error)
      return [] as Style[]
    }),
    // Tags取得（ユーザー固有、認証必要）
    user
      ? getUserTags(supabase, user.id).catch((error) => {
          console.error('Tags取得エラー:', error)
          return [] as PracticeTag[]
        })
      : Promise.resolve([] as PracticeTag[]),
    // チーム情報取得（認証必要）
    user
      ? getUserTeams(supabase, user.id).catch((error) => {
          console.error('チーム情報取得エラー:', error)
          return [] as TeamMembershipWithTeam[]
        }).then(teams => teams as TeamMembershipWithTeam[])
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

