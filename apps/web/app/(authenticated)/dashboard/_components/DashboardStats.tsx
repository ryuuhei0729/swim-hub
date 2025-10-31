'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import { 
  CalendarDaysIcon,
  ChartBarIcon,
  TrophyIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'

export default function DashboardStats() {
  const [practiceCount, setPracticeCount] = useState(0)
  const [recordCount, setRecordCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

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
  }, [supabase])

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

// 今後のイベント一覧コンポーネント
export function UpcomingEventsList() {
  const [data, _setData] = useState(null)
  const [loading, _setLoading] = useState(true)
  const [error, _setError] = useState(null)

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">今後のイベント</h2>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">今後のイベント</h2>
        <div className="flex items-center justify-center py-8">
          <ExclamationTriangleIcon className="h-8 w-8 text-red-500 mr-2" />
          <span className="text-red-600">データの取得に失敗しました</span>
        </div>
      </div>
    )
  }

  type UpcomingEvent = {
    id: string
    title: string
    date: string
    location?: string
  }
  
  const events = (data && typeof data === 'object' && 'upcomingEvents' in data 
    ? (data as { upcomingEvents?: UpcomingEvent[] }).upcomingEvents 
    : []) || []

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">今後のイベント</h2>
      {events.length === 0 ? (
        <p className="text-gray-500 text-center py-8">今後のイベントはありません</p>
      ) : (
        <div className="space-y-4">
          {events.slice(0, 5).map((event: UpcomingEvent) => (
            <div key={event.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">{event.title}</h3>
                <p className="text-sm text-gray-500">
                  {format(new Date(event.date), 'yyyy年MM月dd日')}
                </p>
                {event.location && (
                  <p className="text-sm text-gray-400">📍 {event.location}</p>
                )}
              </div>
              <div className="ml-4">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  イベント
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
