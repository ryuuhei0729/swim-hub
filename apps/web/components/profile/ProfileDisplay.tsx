'use client'

import React from 'react'
import { PencilIcon } from '@heroicons/react/24/outline'

interface UserProfile {
  id: string
  name: string
  birthday?: string | null
  bio?: string | null
  avatar_url?: string | null
}

interface ProfileDisplayProps {
  profile: UserProfile
  onEdit: () => void
}

export default function ProfileDisplay({ profile, onEdit }: ProfileDisplayProps) {
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
      <div className="flex items-start space-x-6">
        {/* 左カラム: プロフィール画像（表示のみ） */}
        <div className="h-28 w-28 md:h-32 md:w-32 rounded-full flex items-center justify-center flex-shrink-0">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="プロフィール画像"
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <span className="text-3xl md:text-4xl font-bold text-white bg-blue-500 rounded-full w-full h-full flex items-center justify-center">
              {profile.name.charAt(0) || '?'}
            </span>
          )}
        </div>

        {/* 右カラム: 情報縦並び */}
        <div className="flex-1 min-w-0">
          {/* 名前 + 編集ボタン */}
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-gray-900 truncate">
              {profile.name}
            </h3>
            <button
              onClick={onEdit}
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <PencilIcon className="h-4 w-4 mr-2" />
              編集
            </button>
          </div>
          

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
            <dd className="mt-1 text-sm text-gray-900">
              {profile.bio || '未設定'}
            </dd>
          </div>
        </div>
      </div>
    </div>
  )
}
