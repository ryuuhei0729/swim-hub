// =============================================================================
// カレンダーデータ取得用Server Component
// =============================================================================

import React from 'react'
import { createAuthenticatedServerClient } from '@/lib/supabase-server-auth'
import { DashboardAPI } from '@apps/shared/api/dashboard'
import { CalendarItem, MonthlySummary } from '@apps/shared/types/ui'
import { endOfMonth, format, startOfMonth } from 'date-fns'

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

  // 月の開始日と終了日を計算
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const startDate = format(monthStart, 'yyyy-MM-dd')
  const endDate = format(monthEnd, 'yyyy-MM-dd')

  // 並行取得でパフォーマンス最適化
  const [calendarItems, monthlySummary] = await Promise.all([
    api.getCalendarEntries(startDate, endDate),
    api.getMonthlySummary(currentDate.getFullYear(), currentDate.getMonth() + 1)
  ])

  return <>{children({ calendarItems, monthlySummary })}</>
}

