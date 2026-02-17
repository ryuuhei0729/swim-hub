'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import type { UserProfile } from '@apps/shared/types'

interface GoogleCalendarSyncSettingsProps {
  profile: UserProfile | null
  onUpdate: () => void
}

export default function GoogleCalendarSyncSettings({
  profile,
  onUpdate
}: GoogleCalendarSyncSettingsProps) {
  const { signInWithOAuth, supabase, user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [bulkSyncing, setBulkSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bulkSyncResult, setBulkSyncResult] = useState<{
    practices: { success: number; error: number }
    competitions: { success: number; error: number }
  } | null>(null)

  const isEnabled = profile?.google_calendar_enabled || false
  const syncPractices = profile?.google_calendar_sync_practices ?? true
  const syncCompetitions = profile?.google_calendar_sync_competitions ?? true

  // Google認証を開始（カレンダー連携用）
  const handleConnectGoogle = async () => {
    setLoading(true)
    setError(null)
    
    // カレンダー連携用のOAuth認証（calendar_connectパラメータ付きでコールバックにリダイレクト）
    const appUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const callbackUrl = `${appUrl}/api/auth/callback?calendar_connect=true&redirect_to=/settings`
    
    const { error } = await signInWithOAuth('google', {
      redirectTo: callbackUrl,
      scopes: 'https://www.googleapis.com/auth/calendar.events',
      queryParams: {
        access_type: 'offline',
        prompt: 'consent'
      }
    })
    
    if (error) {
      setError('Google認証に失敗しました。再度お試しください。')
      setLoading(false)
    }
    // 成功時はOAuthフローでリダイレクトされるため、ここでは何もしない
  }

  // 連携を解除
  const handleDisconnectGoogle = async () => {
    if (!confirm('Googleカレンダー連携を解除しますか？')) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      // RPC関数でトークンを削除（NULLを設定）
      const { error: tokenError } = await supabase.rpc('set_google_refresh_token', {
        p_user_id: user?.id,
        p_token: null
      })

      // google_calendar_enabledフラグを更新
      const { error: updateError } = await supabase
        .from('users')
        .update({
          google_calendar_enabled: false
        })
        .eq('id', user?.id)

      if (tokenError || updateError) {
        throw tokenError || updateError
      }

      // practicesのgoogle_event_idをnullにリセット（再連携時に再同期できるように）
      const { error: practicesResetError } = await supabase
        .from('practices')
        .update({ google_event_id: null })
        .eq('user_id', user?.id)

      if (practicesResetError) {
        throw practicesResetError
      }

      // competitionsのgoogle_event_idをnullにリセット
      const { error: competitionsResetError } = await supabase
        .from('competitions')
        .update({ google_event_id: null })
        .eq('user_id', user?.id)

      if (competitionsResetError) {
        throw competitionsResetError
      }

      onUpdate()
    } catch (err) {
      console.error('連携解除エラー:', err)
      setError('連携解除に失敗しました。')
    } finally {
      setLoading(false)
    }
  }

  // 同期設定を更新
  const handleSyncSettingChange = async (
    field: 'google_calendar_sync_practices' | 'google_calendar_sync_competitions',
    value: boolean
  ) => {
    if (!user) return

    setSyncing(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('users')
        .update({ [field]: value })
        .eq('id', user.id)

      if (error) throw error

      onUpdate()
    } catch (err) {
      console.error('設定更新エラー:', err)
      setError('設定の更新に失敗しました。')
    } finally {
      setSyncing(false)
    }
  }

  // 既存データの一括同期
  const handleBulkSync = async () => {
    if (!user) return

    setBulkSyncing(true)
    setError(null)
    setBulkSyncResult(null)

    try {
      const appUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

      const response = await fetch(`${appUrl}/api/google-calendar/sync-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const error = await response.json() as { error?: string }
        throw new Error(error.error || '一括同期に失敗しました')
      }

      const result = await response.json() as {
        results: {
          practices: { success: number; error: number }
          competitions: { success: number; error: number }
        }
      }
      setBulkSyncResult(result.results)
      onUpdate() // プロフィールを再取得
    } catch (err) {
      console.error('一括同期エラー:', err)
      setError(err instanceof Error ? err.message : '一括同期に失敗しました。')
    } finally {
      setBulkSyncing(false)
    }
  }

  // OAuthコールバック後の処理（API Routeで処理されるため、ここでは再取得のみ）
  useEffect(() => {
    if (!user) return

    const urlParams = new URLSearchParams(window.location.search)
    const calendarConnected = urlParams.get('calendar_connected')
    
    if (calendarConnected === 'true') {
      // カレンダー連携完了後、プロフィールを再取得
      onUpdate()
      // URLパラメータをクリーンアップ
      window.history.replaceState({}, '', '/settings')
    }
  }, [user, onUpdate])

  return (
    <div className="bg-white rounded-lg shadow p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 pb-2 mb-4 border-b border-gray-200">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
          Googleカレンダー連携
        </h2>
        {isEnabled && (
          <span className="inline-flex items-center gap-1 text-sm text-green-600">
            <CheckCircleIcon className="h-5 w-5" />
            連携中
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {!isEnabled ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Googleカレンダーと連携すると、練習記録と大会記録が自動的にカレンダーに追加されます。
          </p>
          <button
            onClick={handleConnectGoogle}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Googleカレンダーと連携
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={syncPractices}
                onChange={(e) => handleSyncSettingChange('google_calendar_sync_practices', e.target.checked)}
                disabled={syncing}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50"
              />
              <span className="text-sm text-gray-700">練習記録を自動同期</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={syncCompetitions}
                onChange={(e) => handleSyncSettingChange('google_calendar_sync_competitions', e.target.checked)}
                disabled={syncing}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50"
              />
              <span className="text-sm text-gray-700">大会記録を自動同期</span>
            </label>
          </div>
          
          <div className="pt-3 border-t border-gray-200">
            <p className="text-sm text-gray-600 mb-3">
              既に登録されている練習記録・大会記録をGoogleカレンダーに同期します。
            </p>
            <button
              onClick={handleBulkSync}
              disabled={bulkSyncing}
              className="inline-flex items-center justify-center px-4 py-2 border border-blue-300 rounded-lg text-sm font-medium text-blue-700 bg-white hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out"
            >
              {bulkSyncing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  同期中...
                </>
              ) : (
                '既存データを同期'
              )}
            </button>
            
            {bulkSyncResult && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
                <p className="font-medium mb-1">同期が完了しました</p>
                <ul className="list-disc list-inside space-y-1">
                  {bulkSyncResult.practices.success > 0 && (
                    <li>練習記録: {bulkSyncResult.practices.success}件を同期</li>
                  )}
                  {bulkSyncResult.competitions.success > 0 && (
                    <li>大会記録: {bulkSyncResult.competitions.success}件を同期</li>
                  )}
                  {(bulkSyncResult.practices.error > 0 || bulkSyncResult.competitions.error > 0) && (
                    <li className="text-yellow-700">
                      エラー: 練習記録{bulkSyncResult.practices.error}件、大会記録{bulkSyncResult.competitions.error}件
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
          
          <div className="pt-3 border-t border-gray-200">
            <button
              onClick={handleDisconnectGoogle}
              disabled={loading}
              className="inline-flex items-center justify-center px-4 py-2 border border-red-300 rounded-lg text-sm font-medium text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out"
            >
              <XCircleIcon className="h-5 w-5 mr-2" />
              連携を解除
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

