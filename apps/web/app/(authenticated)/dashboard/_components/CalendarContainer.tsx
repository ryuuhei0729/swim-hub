'use client'

import React from 'react'
import { CalendarProvider } from '@/contexts'
import CalendarView from './CalendarView'
import { CalendarProps } from '@/types'
import type { CalendarItem, MonthlySummary } from '@apps/shared/types/ui'

interface CalendarContainerProps extends Omit<CalendarProps, 'currentDate' | 'onCurrentDateChange'> {
  initialCalendarItems?: CalendarItem[]
  initialMonthlySummary?: MonthlySummary
}

// カレンダーコンテナ（データ管理）
export default function CalendarContainer({
  initialCalendarItems,
  initialMonthlySummary,
  ...props
}: CalendarContainerProps) {
  // 初期データの月を取得（サーバー側で取得したデータは現在の月のデータなので、現在の日付を使用）
  const initialDate = new Date()

  return (
    <CalendarProvider
      initialCalendarItems={initialCalendarItems}
      initialMonthlySummary={initialMonthlySummary}
      initialDate={initialDate}
    >
      <CalendarView {...props} />
    </CalendarProvider>
  )
}
