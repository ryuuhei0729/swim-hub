'use client'

import React from 'react'
import { MonthItem } from '../hooks/useMonthList'
import { StatusBadge } from './StatusBadge'

interface MonthListProps {
  monthList: MonthItem[]
  onMonthClick: (year: number, month: number) => void
}

const getMonthLabel = (year: number, month: number) => {
  return `${year}年${month}月`
}

export const MonthList = React.memo(({ monthList, onMonthClick }: MonthListProps) => {
  if (monthList.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <p className="text-sm text-gray-600">表示できる月がありません</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {monthList.map((monthItem) => (
        <button
          key={`${monthItem.year}-${monthItem.month}`}
          onClick={() => onMonthClick(monthItem.year, monthItem.month)}
          className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 hover:shadow-md transition-all text-left"
        >
          <span className="text-sm font-medium text-gray-900">
            {getMonthLabel(monthItem.year, monthItem.month)}
          </span>
          <StatusBadge status={monthItem.status} />
        </button>
      ))}
    </div>
  )
})

MonthList.displayName = 'MonthList'
