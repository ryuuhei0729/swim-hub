'use client'

import React from 'react'
import Link from 'next/link'
import { Avatar } from '@/components/ui'
import type { TeamMembershipWithUser } from '@apps/shared/types/database'

interface UserProfile {
  id: string
  name: string
  birthday?: string | null
  bio?: string | null
  profile_image_path?: string | null
}

interface ProfileDisplayProps {
  profile: UserProfile
  teams?: TeamMembershipWithUser[]
}

export default function ProfileDisplay({ profile, teams = [] }: ProfileDisplayProps) {
  const formatBirthday = (birthday: string | null | undefined) => {
    if (!birthday) return '未設定'
    return new Date(birthday).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  // 承認済みかつアクティブなチームのみフィルタリング
  const approvedTeams = teams.filter(
    (membership) => membership.status === 'approved' && membership.is_active === true
  )

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* プロフィール - 左: 画像 / 右: 名前, 生年月日, 自己紹介 */}
      <div className="flex items-start space-x-3 sm:space-x-8">
        {/* 左カラム: プロフィール画像（表示のみ） */}
        <div className="shrink-0 mt-1 sm:mt-3 ml-0 sm:ml-3">
          <div className="sm:hidden">
            <Avatar
              avatarUrl={profile.profile_image_path || null}
              userName={profile.name}
              size="lg"
            />
          </div>
          <div className="hidden sm:block">
          <Avatar
            avatarUrl={profile.profile_image_path || null}
            userName={profile.name}
            size="xxl"
          />
          </div>
        </div>

        {/* 右カラム: 情報縦並び */}
        <div className="flex-1 min-w-0 mt-1 sm:mt-3">
          <h3 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">
            {profile.name}
          </h3>
          

          {/* 生年月日と参加チーム（横並び） */}
          <div className="mt-2 sm:mt-4 flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
            {/* 生年月日 */}
            <div className="flex-1">
              <dt className="text-xs sm:text-sm font-medium text-gray-500">生年月日</dt>
              <dd className="mt-1 text-xs sm:text-sm text-gray-900">
                {formatBirthday(profile.birthday)}
              </dd>
            </div>

            {/* 参加チーム */}
            <div className="flex-1">
              <dt className="text-xs sm:text-sm font-medium text-gray-500">参加チーム</dt>
              <dd className="mt-1">
                {approvedTeams.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {approvedTeams.map((membership) => {
                      const teamName = 'teams' in membership && membership.teams?.name
                        ? membership.teams.name
                        : 'チーム名不明'
                      const teamId = membership.team_id

                      return (
                        <Link
                          key={membership.id}
                          href={`/teams/${teamId}`}
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs sm:text-sm font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors truncate max-w-[200px] sm:max-w-none"
                          title={teamName}
                        >
                          {teamName}
                        </Link>
                      )
                    })}
                  </div>
                ) : (
                  <span className="text-xs sm:text-sm text-gray-500">参加しているチームはありません</span>
                )}
              </dd>
            </div>
          </div>

          {/* 自己紹介 */}
          <div className="mt-2 sm:mt-4">
            <dt className="text-xs sm:text-sm font-medium text-gray-500">自己紹介</dt>
            <dd className="mt-1 text-xs sm:text-sm">
              <div className="bg-gray-50 text-gray-900 p-2 sm:p-4 rounded-lg">
                {profile.bio || '未設定'}
              </div>
            </dd>
          </div>
        </div>
      </div>
    </div>
  )
}
