'use client'

import React from 'react'
import { useAuth } from '@/contexts'
import { useDashboardStatsQuery } from '@apps/shared/hooks/queries/dashboard'
import {
  CalendarDaysIcon,
  ChartBarIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline'

export default function DashboardStats() {
  const { supabase, user } = useAuth()
  const { data, isLoading } = useDashboardStatsQuery(supabase, user?.id)

  const practiceCount = data?.practiceCount ?? 0
  const recordCount = data?.recordCount ?? 0

  const stats = [
    {
      title: '今月の練習',
      value: practiceCount,
      icon: CalendarDaysIcon,
      color: 'bg-blue-500',
      unit: '回'
    },
    {
      title: '大会記録',
      value: recordCount,
      icon: TrophyIcon,
      color: 'bg-green-500',
      unit: '件'
    },
    {
      title: '練習日数',
      value: practiceCount,
      icon: ChartBarIcon,
      color: 'bg-purple-500',
      unit: '日'
    }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {stats.map((stat, index) => (
        <div key={index} className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className={`shrink-0 p-3 rounded-lg ${stat.color}`}>
              <stat.icon className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-gray-500">{stat.title}</p>
              {isLoading ? (
                <div className="animate-pulse h-8 bg-gray-200 rounded mt-1"></div>
              ) : (
                <p className="text-2xl font-semibold text-gray-900">
                  {stat.value}
                  <span className="text-base text-gray-600 ml-1">{stat.unit}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
