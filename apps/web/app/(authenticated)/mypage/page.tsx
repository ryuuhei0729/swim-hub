'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/contexts'
import { createClient } from '@/lib/supabase'
import { UserIcon, TrophyIcon, CalendarIcon } from '@heroicons/react/24/outline'
import BestTimesTable from '@/components/profile/BestTimesTable'
import ProfileDisplay from '@/components/profile/ProfileDisplay'
import ProfileEditModal from '@/components/profile/ProfileEditModal'
import type { UserProfile as UserDB, Record, Style, Competition } from '@apps/shared/types/database'

interface BestTime {
  id: string
  time: number
  created_at: string
  style: {
    name_jp: string
    distance: number
  }
  competition?: {
    title: string
    date: string
  }
}

interface UserProfile {
  id: string
  name: string
  birthday?: string | null
  bio?: string | null
  avatar_url?: string | null
}

export default function MyPage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [bestTimes, setBestTimes] = useState<BestTime[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  const supabase = useMemo(() => createClient(), [])

  const loadProfile = useCallback(async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, birthday, bio, profile_image_path')
        .eq('id', user.id)
        .single()

      if (error) throw error
      
      if (data) {
        const userData = data as UserDB
        setProfile({
          id: userData.id,
          name: userData.name,
          birthday: userData.birthday,
          bio: userData.bio,
          avatar_url: userData.profile_image_path
        })
      }
    } catch (err) {
      console.error('プロフィール取得エラー:', err)
      setError('プロフィールの取得に失敗しました')
    }
  }, [user, supabase])

  const loadBestTimes = useCallback(async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('records')
        .select(`
          id,
          time,
          created_at,
          styles!records_style_id_fkey (
            name_jp,
            distance
          ),
          competitions!records_competition_id_fkey (
            title,
            date
          )
        `)
        .eq('user_id', user.id)
        .order('time', { ascending: true })

      if (error) throw error

      // 種目ごとのベストタイムを取得
      type RecordWithRelations = Record & {
        styles?: Style | null
        competitions?: Competition | null
      }
      
      const bestTimesByStyle = new Map<string, BestTime>()
      
      if (data && Array.isArray(data)) {
        data.forEach((record: RecordWithRelations) => {
          const styleKey = record.styles?.name_jp || 'Unknown'
          
          if (!bestTimesByStyle.has(styleKey) || record.time < bestTimesByStyle.get(styleKey)!.time) {
            bestTimesByStyle.set(styleKey, {
              id: record.id,
              time: record.time,
              created_at: record.created_at,
              style: {
                name_jp: record.styles?.name_jp || 'Unknown',
                distance: record.styles?.distance || 0
              },
              competition: record.competitions ? {
                title: record.competitions.title,
                date: record.competitions.date
              } : undefined
            })
          }
        })
      }

      setBestTimes(Array.from(bestTimesByStyle.values()))
    } catch (err) {
      console.error('ベストタイム取得エラー:', err)
      setError('ベストタイムの取得に失敗しました')
    }
  }, [user, supabase])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    await Promise.all([
      loadProfile(),
      loadBestTimes()
    ])
    
    setLoading(false)
  }, [loadProfile, loadBestTimes])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleProfileUpdate = useCallback(async (updatedProfile: Partial<UserProfile>) => {
    if (!user) return

    try {
      // データベースのカラム名に合わせて変換
      type UserUpdate = {
        name?: string
        birthday?: string | null
        bio?: string | null
        profile_image_path?: string | null
      }
      
      const dbUpdate: UserUpdate = {}
      if (updatedProfile.name !== undefined) dbUpdate.name = updatedProfile.name
      if (updatedProfile.birthday !== undefined) dbUpdate.birthday = updatedProfile.birthday
      if (updatedProfile.bio !== undefined) dbUpdate.bio = updatedProfile.bio
      if (updatedProfile.avatar_url !== undefined) dbUpdate.profile_image_path = updatedProfile.avatar_url

      // TODO: Supabase型推論の制約回避のため一時的にas any
      const { error } = await (supabase as any)
        .from('users')
        .update(dbUpdate)
        .eq('id', user.id)

      if (error) throw error

      setProfile(prev => prev ? { ...prev, ...updatedProfile } : null)
    } catch (err) {
      console.error('プロフィール更新エラー:', err)
      throw err
    }
  }, [user, supabase])

  const handleAvatarChange = useCallback(async (newAvatarUrl: string | null) => {
    if (!user) return

    try {
      // TODO: Supabase型推論の制約回避のため一時的にas any
      const { error } = await (supabase as any)
        .from('users')
        .update({ profile_image_path: newAvatarUrl })
        .eq('id', user.id)

      if (error) throw error

      setProfile(prev => prev ? { ...prev, avatar_url: newAvatarUrl } : null)
    } catch (err) {
      console.error('アバター更新エラー:', err)
      throw err
    }
  }, [user, supabase])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center">
            <div className="text-red-600 mb-4">
              <UserIcon className="h-12 w-12 mx-auto" />
            </div>
            <h2 className="text-lg font-medium text-gray-900 mb-2">エラーが発生しました</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={loadData}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              再試行
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          マイページ
        </h1>
        <p className="text-gray-600">
          プロフィールとベストタイムを管理します
        </p>
      </div>

      <div className="space-y-6">
        {/* プロフィール表示 */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between pb-2 mb-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              プロフィール
            </h2>
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              編集
            </button>
          </div>
          {profile && (
            <ProfileDisplay
              profile={profile}
            />
          )}
        </div>

        {/* ベストタイム表 */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center space-x-2 mb-4">
            <TrophyIcon className="h-5 w-5 text-yellow-500" />
            <h2 className="text-2xl font-semibold text-gray-900">Best Time</h2>
          </div>
          
          <BestTimesTable bestTimes={bestTimes} />
        </div>
      </div>

      {/* プロフィール編集モーダル */}
      {profile && (
        <ProfileEditModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          profile={profile}
          onUpdate={handleProfileUpdate}
          onAvatarChange={handleAvatarChange}
        />
      )}
    </div>
  )
}
