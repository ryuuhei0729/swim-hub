'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts'
import { useUserQuery, userKeys } from '@apps/shared/hooks'
import { useQueryClient } from '@tanstack/react-query'
import GoogleCalendarSyncSettings from '@/components/settings/GoogleCalendarSyncSettings'
import EmailChangeSettings from '@/components/settings/EmailChangeSettings'
import IdentityLinkSettings from '@/components/settings/IdentityLinkSettings'
import AccountDeleteSettings from '@/components/settings/AccountDeleteSettings'

export default function SettingsClient() {
  const { user, supabase } = useAuth()
  const queryClient = useQueryClient()
  const { profile } = useUserQuery(supabase, {
    userId: user?.id,
  })

  const handleGoogleCalendarUpdate = () => {
    if (user) {
      queryClient.invalidateQueries({ queryKey: userKeys.profile(user.id) })
      queryClient.invalidateQueries({ queryKey: userKeys.currentProfile() })
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-2">
          <Link
            href="/mypage"
            className="inline-flex items-center justify-center p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="マイページに戻る"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            設定
          </h1>
        </div>
        <p className="text-sm sm:text-base text-gray-600 ml-10">
          アカウントや連携サービスの設定を管理します
        </p>
      </div>

      {/* Googleカレンダー連携設定 */}
      <GoogleCalendarSyncSettings
        profile={profile}
        onUpdate={handleGoogleCalendarUpdate}
      />

      {/* メールアドレス変更 */}
      <EmailChangeSettings />

      {/* ログイン連携 */}
      <IdentityLinkSettings />

      {/* アカウント削除 */}
      <AccountDeleteSettings />
    </div>
  )
}
