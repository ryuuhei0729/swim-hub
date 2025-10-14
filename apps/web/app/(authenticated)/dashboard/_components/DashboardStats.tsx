'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { 
  CalendarDaysIcon,
  ChartBarIcon,
  TrophyIcon
} from '@heroicons/react/24/outline'

export default function DashboardStats() {
  const [practiceCount, setPracticeCount] = useState(0)
  const [recordCount, setRecordCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // 今月の練習回数を取得
        const today = new Date()
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
          .toISOString().split('T')[0]
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
          .toISOString().split('T')[0]

        const { count: practices } = await supabase
          .from('practices')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('date', startOfMonth)
          .lte('date', endOfMonth)

        // 大会記録数を取得（全期間）
        const { count: records } = await supabase
          .from('records')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)

        setPracticeCount(practices || 0)
        setRecordCount(records || 0)
      } catch (error) {
        console.error('統計データの取得に失敗:', error)
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [])

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
            <div className={`flex-shrink-0 p-3 rounded-lg ${stat.color}`}>
              <stat.icon className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-gray-500">{stat.title}</p>
              {loading ? (
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

