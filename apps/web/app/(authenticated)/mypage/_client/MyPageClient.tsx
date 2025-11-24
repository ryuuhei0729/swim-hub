'use client'

import React, { useState, useCallback } from 'react'
import { useAuth } from '@/contexts'
import { useUserQuery, userKeys } from '@apps/shared/hooks'
import { useQueryClient } from '@tanstack/react-query'
import { TrophyIcon } from '@heroicons/react/24/outline'
import BestTimesTable from '@/components/profile/BestTimesTable'
import ProfileDisplay from '@/components/profile/ProfileDisplay'
import ProfileEditModal from '@/components/profile/ProfileEditModal'
import type { UserUpdate } from '@apps/shared/types/database'

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
  profile_image_path?: string | null
}

interface MyPageClientProps {
  // サーバー側で取得したデータ
  initialProfile: UserProfile | null
  initialBestTimes: BestTime[]
}

/**
 * マイページのインタラクティブ部分を担当するClient Component
 */
export default function MyPageClient({
  initialProfile,
  initialBestTimes
}: MyPageClientProps) {
  const { user, supabase } = useAuth()
  const queryClient = useQueryClient()
  const { profile: queryProfile } = useUserQuery(supabase, {
    userId: user?.id,
    initialProfile: initialProfile as import('@apps/shared/types/database').UserProfile | null,
  })
  const [bestTimes, setBestTimes] = useState<BestTime[]>(initialBestTimes)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  // サーバー側から取得した初期データを設定
  React.useEffect(() => {
    setBestTimes(initialBestTimes)
  }, [initialBestTimes])

  // queryProfileをUserProfile型に変換
  const profile: UserProfile | null = queryProfile ? {
    id: queryProfile.id,
    name: queryProfile.name,
    birthday: queryProfile.birthday,
    bio: queryProfile.bio,
    avatar_url: queryProfile.profile_image_path,
    profile_image_path: queryProfile.profile_image_path,
  } : null

  const handleProfileUpdate = useCallback(async (updatedProfile: Partial<UserProfile>) => {
    if (!user) return

    try {
      // データベースのカラム名に合わせて変換
      const dbUpdate: UserUpdate = {}
      if (updatedProfile.name !== undefined) dbUpdate.name = updatedProfile.name
      if (updatedProfile.birthday !== undefined) dbUpdate.birthday = updatedProfile.birthday
      if (updatedProfile.bio !== undefined) dbUpdate.bio = updatedProfile.bio
      if (updatedProfile.avatar_url !== undefined) dbUpdate.profile_image_path = updatedProfile.avatar_url
      if (updatedProfile.profile_image_path !== undefined) dbUpdate.profile_image_path = updatedProfile.profile_image_path

      const { error } = await supabase
        .from('users')
        .update(dbUpdate as any)
        .eq('id', user.id)

      if (error) throw error

      // React Queryのキャッシュを無効化して再取得
      if (user) {
        queryClient.invalidateQueries({ queryKey: userKeys.profile(user.id) })
        queryClient.invalidateQueries({ queryKey: userKeys.currentProfile() })
      }
    } catch (err) {
      console.error('プロフィール更新エラー:', err)
      throw err
    }
  }, [user, supabase, queryClient])

  const handleAvatarChange = useCallback(async (newAvatarUrl: string | null) => {
    if (!user) return

    try {
      const { error } = await supabase
        .from('users')
        .update({ profile_image_path: newAvatarUrl } as any)
        .eq('id', user.id)

      if (error) throw error

      // React Queryのキャッシュを無効化して再取得
      if (user) {
        queryClient.invalidateQueries({ queryKey: userKeys.profile(user.id) })
        queryClient.invalidateQueries({ queryKey: userKeys.currentProfile() })
      }
    } catch (err) {
      console.error('アバター更新エラー:', err)
      throw err
    }
  }, [user, supabase, queryClient])

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

