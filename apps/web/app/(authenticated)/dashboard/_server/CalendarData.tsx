// =============================================================================
// カレンダーデータ取得用Server Component
// =============================================================================

import React from 'react'
import { createAuthenticatedServerClient } from '@/lib/supabase-server-auth'
import { DashboardAPI } from '@apps/shared/api/dashboard'
import { CalendarItem, MonthlySummary } from '@apps/shared/types/ui'
import { endOfMonth, startOfMonth } from 'date-fns'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'

interface CalendarDataProps {
  currentDate?: Date
  children: (data: {
    calendarItems: CalendarItem[]
    monthlySummary: MonthlySummary
  }) => React.ReactNode
}

/**
 * カレンダーデータをサーバー側で取得するServer Component
 * Suspenseでラップして使用してください
 */
export default async function CalendarData({
  currentDate = new Date(),
  children
}: CalendarDataProps) {
  const supabase = await createAuthenticatedServerClient()
  const api = new DashboardAPI(supabase)

  // タイムゾーンを考慮した日付変換（日本時間 'Asia/Tokyo'）
  const TIMEZONE = 'Asia/Tokyo'
  // currentDate をUTCとして扱い、日本時間に変換
  const zonedDate = toZonedTime(currentDate, TIMEZONE)

  // 月の開始日と終了日を計算（タイムゾーン考慮済み）
  const monthStart = startOfMonth(zonedDate)
  const monthEnd = endOfMonth(zonedDate)
  // 日本時間でフォーマット
  const startDate = formatInTimeZone(monthStart, TIMEZONE, 'yyyy-MM-dd')
  const endDate = formatInTimeZone(monthEnd, TIMEZONE, 'yyyy-MM-dd')

  // 並行取得でパフォーマンス最適化
  const [calendarItems, monthlySummary] = await Promise.all([
    api.getCalendarEntries(startDate, endDate),
    api.getMonthlySummary(zonedDate.getFullYear(), zonedDate.getMonth() + 1)
  ])

  return <>{children({ calendarItems, monthlySummary })}</>
}

