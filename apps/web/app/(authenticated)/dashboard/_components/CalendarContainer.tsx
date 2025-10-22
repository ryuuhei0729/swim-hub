'use client'

import React from 'react'
import { CalendarProvider } from '@/contexts'
import CalendarView from './CalendarView'
import { CalendarProps } from '@/types'

// カレンダーコンテナ（データ管理）
export default function CalendarContainer(props: Omit<CalendarProps, 'currentDate' | 'onCurrentDateChange'>) {
  return (
    <CalendarProvider>
      <CalendarView {...props} />
    </CalendarProvider>
  )
}
