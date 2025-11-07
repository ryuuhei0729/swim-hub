'use client'

import React from 'react'
import { Avatar } from '@/components/ui'

interface UserProfile {
  id: string
  name: string
  birthday?: string | null
  bio?: string | null
  profile_image_path?: string | null
}

interface ProfileDisplayProps {
  profile: UserProfile
}

export default function ProfileDisplay({ profile }: ProfileDisplayProps) {
  const formatBirthday = (birthday: string | null | undefined) => {
    if (!birthday) return '未設定'
    return new Date(birthday).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div className="space-y-6">
      {/* プロフィール - 左: 画像 / 右: 名前, 生年月日, 自己紹介 */}
      <div className="flex items-start space-x-8">
        {/* 左カラム: プロフィール画像（表示のみ） */}
        <div className="flex-shrink-0 mt-3 ml-3">
          <Avatar
            avatarUrl={profile.profile_image_path || null}
            userName={profile.name}
            size="xxl"
          />
        </div>

        {/* 右カラム: 情報縦並び */}
        <div className="flex-1 min-w-0 mt-3">
          <h3 className="text-2xl font-bold text-gray-900 truncate">
            {profile.name}
          </h3>
          

          {/* 生年月日 */}
          <div className="mt-4">
            <dt className="text-sm font-medium text-gray-500">生年月日</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {formatBirthday(profile.birthday)}
            </dd>
          </div>

          {/* 自己紹介 */}
          <div className="mt-4">
            <dt className="text-sm font-medium text-gray-500">自己紹介</dt>
            <dd className="mt-1 text-sm">
              <div className="bg-gray-50 text-gray-900 p-4 rounded-lg">
                {profile.bio || '未設定'}
              </div>
            </dd>
          </div>
        </div>
      </div>
    </div>
  )
}
