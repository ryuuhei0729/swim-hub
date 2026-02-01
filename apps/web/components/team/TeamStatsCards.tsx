'use client'

import React from 'react'
import {
  UsersIcon,
  ClockIcon,
  TrophyIcon,
  CalendarDaysIcon
} from '@heroicons/react/24/outline'
import { formatDate } from '@apps/shared/utils/date'

export interface TeamStats {
  memberCount: number
  practiceCount: number
  recordCount: number
  lastActivity: string | null
}

export interface TeamStatsCardsProps {
  stats: TeamStats
  isLoading?: boolean
}

export default function TeamStatsCards({ stats, isLoading = false }: TeamStatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="bg-white rounded-lg shadow p-6">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-12 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-20"></div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const statsData = [
    {
      title: 'メンバー',
      value: stats.memberCount,
      icon: UsersIcon,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600'
    },
    {
      title: '練習回数',
      value: stats.practiceCount,
      icon: ClockIcon,
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
      textColor: 'text-green-600'
    },
    {
      title: '記録数',
      value: stats.recordCount,
      icon: TrophyIcon,
      color: 'bg-yellow-500',
      bgColor: 'bg-yellow-50',
      textColor: 'text-yellow-600'
    },
    {
      title: '最近の活動',
      value: stats.lastActivity ? formatLastActivity(stats.lastActivity) : 'なし',
      icon: CalendarDaysIcon,
      color: 'bg-orange-500',
      bgColor: 'bg-orange-50',
      textColor: 'text-orange-600'
    }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {statsData.map((stat, index) => (
        <div 
          key={index}
          className="bg-white rounded-lg shadow hover:shadow-md transition-shadow duration-200 p-6"
        >
          <div className="flex items-center">
            <div className={`shrink-0 p-3 rounded-lg ${stat.bgColor}`}>
              <stat.icon className={`h-6 w-6 ${stat.textColor}`} />
            </div>
            <div className="ml-4">
              <p className={`text-2xl font-bold ${stat.textColor}`}>
                {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
              </p>
              <p className="text-sm font-medium text-gray-600">
                {stat.title}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// 最近の活動日をフォーマット
function formatLastActivity(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffTime = Math.abs(now.getTime() - date.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 1) {
    return '昨日'
  } else if (diffDays <= 7) {
    return `${diffDays}日前`
  } else if (diffDays <= 30) {
    const weeks = Math.floor(diffDays / 7)
    return `${weeks}週間前`
  } else {
    return formatDate(dateString, 'short')
  }
}
