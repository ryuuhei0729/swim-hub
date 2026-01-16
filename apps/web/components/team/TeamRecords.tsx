'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts'
import { 
  TrophyIcon,
  StarIcon,
  UserIcon
} from '@heroicons/react/24/outline'

export interface TeamRecord {
  id: string
  user_id: string
  time: number
  created_at: string
  users?: {
    name: string
  }
  styles?: {
    name_jp: string
    distance: number
  }
  competitions?: {
    title: string
    date: string
  }
}

export interface TeamRecordsProps {
  teamId: string
  isAdmin?: boolean
}

export default function TeamRecords({ teamId, isAdmin: _isAdmin = false }: TeamRecordsProps) {
  const router = useRouter()
  const [records, setRecords] = useState<TeamRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedStyle, setSelectedStyle] = useState<string>('all')
  const [styles, setStyles] = useState<{id: string, name_jp: string, distance: number}[]>([])
  
  const { supabase } = useAuth()

  // チームの記録を取得
  useEffect(() => {
    const loadTeamRecords = async () => {
      try {
        setLoading(true)
        setError(null)
        
        // 種目一覧を取得
        const { data: stylesData, error: stylesError } = await supabase
          .from('styles')
          .select('id, name_jp, distance')
          .order('name_jp')

        if (stylesError) throw stylesError
        setStyles(stylesData || [])

        // チームIDが設定された記録を取得
        const query = supabase
          .from('records')
          .select(`
            id,
            user_id,
            time,
            created_at,
            users!records_user_id_fkey (
              name
            ),
            styles!records_style_id_fkey (
              name_jp,
              distance
            ),
            competitions!records_competition_id_fkey (
              title,
              date
            )
          `)
          .eq('team_id', teamId)
          .order('time', { ascending: true })
          .limit(50) // 上位50件のみ

        if (selectedStyle !== 'all') {
          query.eq('style_id', selectedStyle)
        }

        const { data: recordsData, error: recordsError } = await query

        if (recordsError) throw recordsError

        // SupabaseのJOIN結果をTeamRecord型に変換
        const transformedRecords: TeamRecord[] = (recordsData || []).map((record: Record<string, unknown>) => ({
          id: String(record.id ?? ''),
          user_id: String(record.user_id ?? ''),
          time: typeof record.time === 'number' ? record.time : 0,
          created_at: String(record.created_at ?? ''),
          users: Array.isArray(record.users) && record.users.length > 0 
            ? (record.users[0] as TeamRecord['users'])
            : (record.users as TeamRecord['users'] | undefined),
          styles: Array.isArray(record.styles) && record.styles.length > 0
            ? (record.styles[0] as TeamRecord['styles'])
            : (record.styles as TeamRecord['styles'] | undefined),
          competitions: Array.isArray(record.competitions) && record.competitions.length > 0
            ? (record.competitions[0] as TeamRecord['competitions'])
            : (record.competitions as TeamRecord['competitions'] | undefined),
        }))

        setRecords(transformedRecords)
      } catch (err) {
        console.error('チーム記録情報の取得に失敗:', err)
        setError('チーム記録情報の取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }

    loadTeamRecords()
  }, [teamId, selectedStyle, supabase])

  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60)
    const seconds = time % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <TrophyIcon className="h-6 w-6 text-yellow-500" />
      case 1:
        return <StarIcon className="h-6 w-6 text-gray-400" />
      case 2:
        return <StarIcon className="h-6 w-6 text-amber-600" />
      default:
        return <span className="text-lg font-bold text-gray-600">#{index + 1}</span>
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg">
                <div className="h-6 w-6 bg-gray-200 rounded"></div>
                <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-24"></div>
                </div>
                <div className="h-6 bg-gray-200 rounded w-16"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-8">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.refresh()}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            再試行
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          チーム記録ランキング
        </h2>
        
        {/* 種目フィルター */}
        <select
          value={selectedStyle}
          onChange={(e) => setSelectedStyle(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">全種目</option>
          {styles.map((style) => (
            <option key={style.id} value={style.id}>
              {style.name_jp} {style.distance}m
            </option>
          ))}
        </select>
      </div>

      {/* 記録ランキング */}
      <div className="space-y-3">
        {records.map((record, index) => (
          <div 
            key={record.id}
            className="flex items-center space-x-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-200"
          >
            {/* 順位 */}
            <div className="shrink-0 w-8">
              {getRankIcon(index)}
            </div>
            
            {/* ユーザーアイコン */}
            <div className="shrink-0">
              <div className="h-10 w-10 bg-gray-300 rounded-full flex items-center justify-center">
                <UserIcon className="h-6 w-6 text-gray-600" />
              </div>
            </div>
            
            {/* 記録情報 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {record.users?.name || 'Unknown User'}
                </p>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span>{record.styles?.name_jp} {record.styles?.distance}m</span>
                {record.competitions && (
                  <>
                    <span>•</span>
                    <span>{record.competitions.title}</span>
                    <span>•</span>
                    <span>{new Date(record.competitions.date + 'T00:00:00').toLocaleDateString('ja-JP')}</span>
                  </>
                )}
              </div>
            </div>
            
            {/* タイム */}
            <div className="shrink-0 text-right">
              <p className="text-lg font-bold text-gray-900">
                {formatTime(record.time)}
              </p>
            </div>
          </div>
        ))}
        
        {records.length === 0 && (
          <div className="text-center py-8">
            <TrophyIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">
              {selectedStyle === 'all' ? '記録がありません' : 'この種目の記録がありません'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
