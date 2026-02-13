'use client'

import React, { useState, useCallback } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts'
import { useUserQuery, userKeys } from '@apps/shared/hooks'
import { useTeamsQuery } from '@apps/shared/hooks/queries/teams'
import { teamKeys } from '@apps/shared/hooks/queries/keys'
import { useQueryClient } from '@tanstack/react-query'
import { TrophyIcon, DocumentArrowUpIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'
import BestTimesTable from '@/components/profile/BestTimesTable'
import ProfileDisplay from '@/components/profile/ProfileDisplay'
import ProfileEditModal from '@/components/profile/ProfileEditModal'
import dynamic from 'next/dynamic'

const TeamCreateModal = dynamic(() => import('@/components/team/TeamCreateModal'))
const TeamJoinModal = dynamic(() => import('@/components/team/TeamJoinModal'))
import type { UserUpdate } from '@apps/shared/types'

interface BestTime {
  id: string
  time: number
  created_at: string
  pool_type: number // 0: 短水路, 1: 長水路
  is_relaying: boolean
  style: {
    name_jp: string
    distance: number
  }
  competition?: {
    title: string
    date: string
  }
  // 引き継ぎありのタイム（オプショナル）
  relayingTime?: {
    id: string
    time: number
    created_at: string
    competition?: {
      title: string
      date: string
    }
  }
}

interface UserProfile {
  id: string
  name: string
  gender?: number
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
    initialProfile: initialProfile as import('@swim-hub/shared/types').UserProfile | null,
  })
  
  // チーム一覧を取得（React Queryで管理）
  const { teams = [] } = useTeamsQuery(supabase)
  const [bestTimes] = useState<BestTime[]>(initialBestTimes)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false)
  const [isJoinTeamModalOpen, setIsJoinTeamModalOpen] = useState(false)

  // queryProfileをUserProfile型に変換
  const profile: UserProfile | null = queryProfile ? {
    id: queryProfile.id,
    name: queryProfile.name,
    gender: queryProfile.gender,
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
      if (updatedProfile.gender !== undefined) dbUpdate.gender = updatedProfile.gender
      if (updatedProfile.birthday !== undefined) dbUpdate.birthday = updatedProfile.birthday
      if (updatedProfile.bio !== undefined) dbUpdate.bio = updatedProfile.bio
      if (updatedProfile.avatar_url !== undefined) dbUpdate.profile_image_path = updatedProfile.avatar_url
      if (updatedProfile.profile_image_path !== undefined) dbUpdate.profile_image_path = updatedProfile.profile_image_path

      const { error } = await supabase
        .from('users')
        .update(dbUpdate as Record<string, unknown>)
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
        .update({ profile_image_path: newAvatarUrl } as Record<string, unknown>)
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

  // チーム一覧を再取得する関数
  const reloadTeams = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: teamKeys.list() })
  }, [queryClient])

  // チーム作成成功時のハンドラー
  const handleCreateTeamSuccess = useCallback((_teamId: string) => {
    // ページをリロードして最新状態を反映
    window.location.reload()
  }, [])

  // チーム参加成功時のハンドラー
  const handleJoinTeamSuccess = useCallback((_teamId: string) => {
    setIsJoinTeamModalOpen(false)
    reloadTeams()
  }, [reloadTeams])

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            マイページ
          </h1>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="設定画面を開く"
          >
            <Cog6ToothIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>設定</span>
          </Link>
        </div>
        <p className="text-sm sm:text-base text-gray-600">
          プロフィールとベストタイムを管理します
        </p>
      </div>

      <div className="space-y-4 sm:space-y-6">
        {/* プロフィール表示 */}
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 pb-2 mb-4 border-b border-gray-200">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
              プロフィール
            </h2>
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="inline-flex items-center justify-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 self-start sm:self-auto"
            >
              編集
            </button>
          </div>
          {profile && (
            <ProfileDisplay
              profile={profile}
              teams={teams}
              onCreateTeam={() => setIsCreateTeamModalOpen(true)}
              onJoinTeam={() => setIsJoinTeamModalOpen(true)}
            />
          )}
        </div>

        {/* ベストタイム表 */}
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4">
            <div className="flex items-center space-x-2">
              <TrophyIcon className="h-5 w-5 text-yellow-500" />
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">Best Time</h2>
            </div>
            <Link
              href="/bulk-besttime"
              className="inline-flex items-center justify-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors self-start sm:self-auto"
            >
              <DocumentArrowUpIcon className="h-4 w-4 mr-1.5" />
              一括入力
            </Link>
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

      {/* チーム作成モーダル */}
      <TeamCreateModal
        isOpen={isCreateTeamModalOpen}
        onClose={() => setIsCreateTeamModalOpen(false)}
        onSuccess={handleCreateTeamSuccess}
      />

      {/* チーム参加モーダル */}
      <TeamJoinModal
        isOpen={isJoinTeamModalOpen}
        onClose={() => setIsJoinTeamModalOpen(false)}
        onSuccess={handleJoinTeamSuccess}
      />
    </div>
  )
}

