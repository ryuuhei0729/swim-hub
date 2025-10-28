'use client'

import React from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { LoadingSpinner } from '@/components/ui'

interface CalendarHeaderProps {
  currentDate: Date
  isLoading: boolean
  onPrevMonth: () => void
  onNextMonth: () => void
  onTodayClick: () => void
  onMonthYearSelect: (year: number, month: number) => void
  showMonthSelector: boolean
  setShowMonthSelector: (show: boolean) => void
}

export default function CalendarHeader({
  currentDate,
  isLoading,
  onPrevMonth,
  onNextMonth,
  onTodayClick,
  onMonthYearSelect,
  showMonthSelector,
  setShowMonthSelector
}: CalendarHeaderProps) {
  return (
    <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-white">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
        <div className="flex items-center space-x-2">
          <h2 className="hidden sm:block text-xl font-semibold text-gray-900">
            カレンダー
          </h2>
          {isLoading && <LoadingSpinner size="sm" />}
        </div>
        <div className="flex items-center justify-center sm:justify-end space-x-1">
          <button
            onClick={onTodayClick}
            className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200 hover:border-blue-300"
            disabled={isLoading}
            title="今月に戻る"
          >
            今日
          </button>
          <button
            onClick={onPrevMonth}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
            disabled={isLoading}
            aria-label="前の月"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => setShowMonthSelector(true)}
            className="text-base sm:text-lg font-medium text-gray-900 min-w-[100px] sm:min-w-[120px] text-center hover:bg-gray-100 rounded-lg px-3 py-2 transition-colors"
            disabled={isLoading}
          >
            {format(currentDate, 'yyyy年M月', { locale: ja })}
          </button>
          <button
            onClick={onNextMonth}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
            disabled={isLoading}
            aria-label="次の月"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
