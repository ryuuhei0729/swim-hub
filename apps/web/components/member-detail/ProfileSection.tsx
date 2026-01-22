import React from 'react'
import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Avatar } from '@/components/ui'
import { StarIcon } from '@heroicons/react/24/outline'
import type { MemberDetail } from '@/types/member-detail'

interface ProfileSectionProps {
  member: MemberDetail
  currentUserId: string
}

export function ProfileSection({ member, currentUserId }: ProfileSectionProps) {
  return (
    <div className="mb-10">
      <div className="flex items-start space-x-8">
        {/* プロフィール画像 */}
        <div className="shrink-0">
          <Avatar
            avatarUrl={member.users?.profile_image_path || null}
            userName={member.users?.name || 'Unknown User'}
            size="xxl"
          />
        </div>

        {/* 基本情報 */}
        <div className="flex-1">
          <div className="flex items-center space-x-4 mb-5">
            <h3 className="text-3xl font-bold text-gray-900">
              {member.users?.name || 'Unknown User'}
            </h3>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              member.role === 'admin'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
              {member.role === 'admin' ? '管理者' : 'ユーザー'}
            </span>
            {member.user_id === currentUserId && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                あなた
              </span>
            )}
            {member.role === 'admin' && (
              <StarIcon className="h-4 w-4 text-yellow-500" />
            )}
          </div>

          <div className="text-sm text-gray-600 mb-4">
            {member.users?.birthday && (
              <p>生年月日: {format(parseISO(member.users.birthday), 'yyyy年MM月dd日', { locale: ja })}</p>
            )}
          </div>

          {/* 自己紹介 */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-3">自己紹介</h4>
            <p className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg">
              {member.users?.bio || `${member.users?.name || 'Unknown User'}の自己紹介文です。まだ自己紹介が設定されていません。`}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
