'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts'
import type { UserIdentity } from '@supabase/supabase-js'

interface ProviderInfo {
  id: string
  name: string
  icon: React.ReactNode
  identity: UserIdentity | null
}

const GoogleIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
)

const AppleIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24">
    <path
      fill="#000000"
      d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
    />
  </svg>
)

export default function IdentityLinkSettings() {
  const { supabase } = useAuth()
  const [identities, setIdentities] = useState<UserIdentity[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unlinkConfirm, setUnlinkConfirm] = useState<string | null>(null)

  const fetchIdentities = useCallback(async () => {
    if (!supabase) return
    try {
      const { data, error: fetchError } = await supabase.auth.getUserIdentities()
      if (fetchError) {
        setError(fetchError.message)
        return
      }
      setIdentities(data?.identities ?? [])
    } catch {
      setError('連携情報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchIdentities()
  }, [fetchIdentities])

  const getProviderIdentity = (provider: string): UserIdentity | null => {
    return identities.find((i) => i.provider === provider) ?? null
  }

  const getProviderEmail = (identity: UserIdentity | null): string | null => {
    if (!identity) return null
    return (identity.identity_data?.email as string) ?? null
  }

  const canUnlink = identities.length > 1

  const handleLink = async (provider: 'google' | 'apple') => {
    if (!supabase) return
    setActionLoading(provider)
    setError(null)
    try {
      const { data, error: linkError } = await supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo: `${window.location.origin}/?redirect_to=/mypage`,
        },
      })
      if (linkError) {
        setError(linkError.message)
        return
      }
      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      setError('連携に失敗しました。再度お試しください。')
    } finally {
      setActionLoading(null)
    }
  }

  const handleUnlink = async (provider: string) => {
    if (!supabase || !canUnlink) return
    const identity = getProviderIdentity(provider)
    if (!identity) return

    setActionLoading(provider)
    setError(null)
    setUnlinkConfirm(null)
    try {
      const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity)
      if (unlinkError) {
        setError(unlinkError.message)
        return
      }
      await fetchIdentities()
    } catch {
      setError('連携解除に失敗しました。再度お試しください。')
    } finally {
      setActionLoading(null)
    }
  }

  const providers: ProviderInfo[] = [
    {
      id: 'google',
      name: 'Google',
      icon: <GoogleIcon />,
      identity: getProviderIdentity('google'),
    },
    {
      id: 'apple',
      name: 'Apple',
      icon: <AppleIcon />,
      identity: getProviderIdentity('apple'),
    },
  ]

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 pb-2 mb-4 border-b border-gray-200">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
            ログイン連携
          </h2>
        </div>
        <div className="flex items-center justify-center py-4">
          <svg
            className="animate-spin h-5 w-5 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 pb-2 mb-4 border-b border-gray-200">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
          ログイン連携
        </h2>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {providers.map((provider) => {
          const isLinked = !!provider.identity
          const email = getProviderEmail(provider.identity)
          const isLoading = actionLoading === provider.id
          const isConfirming = unlinkConfirm === provider.id

          return (
            <div
              key={provider.id}
              className="flex items-center justify-between py-2"
            >
              <div className="flex items-center gap-3">
                <div className="shrink-0">{provider.icon}</div>
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {provider.name}
                  </div>
                  {isLinked ? (
                    <div className="text-xs text-green-600">
                      連携済み{email ? `（${email}）` : ''}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">未連携</div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isLinked ? (
                  isConfirming ? (
                    <>
                      <span className="text-xs text-gray-500">解除しますか？</span>
                      <button
                        type="button"
                        onClick={() => handleUnlink(provider.id)}
                        disabled={isLoading}
                        className="inline-flex items-center justify-center px-3 py-1.5 border border-red-300 rounded-md text-xs font-medium text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 transition-colors"
                      >
                        {isLoading ? '解除中...' : '確認'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnlinkConfirm(null)}
                        disabled={isLoading}
                        className="inline-flex items-center justify-center px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 transition-colors"
                      >
                        キャンセル
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setUnlinkConfirm(provider.id)}
                      disabled={!canUnlink || isLoading}
                      title={!canUnlink ? '最低1つのログイン方法が必要です' : undefined}
                      className="inline-flex items-center justify-center px-3 py-1.5 border border-gray-300 rounded-md text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      解除する
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => handleLink(provider.id as 'google' | 'apple')}
                    disabled={isLoading}
                    className="inline-flex items-center justify-center px-3 py-1.5 border border-gray-300 rounded-md text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
                  >
                    {isLoading ? (
                      <>
                        <svg
                          className="animate-spin -ml-1 mr-1.5 h-3.5 w-3.5 text-gray-500"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        連携中...
                      </>
                    ) : (
                      '連携する'
                    )}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {!canUnlink && identities.length > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          ※ 最低1つのログイン方法が必要なため、すべての連携を解除することはできません
        </p>
      )}
    </div>
  )
}
