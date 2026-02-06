/**
 * Google認証フック
 * expo-web-browserを使用してOAuthフローを実行
 */
import { useState, useCallback } from 'react'
import * as WebBrowser from 'expo-web-browser'
import {
  buildGoogleAuthUrl,
  extractTokensFromUrl,
  type GoogleAuthOptions,
} from '@/lib/google-auth'
import { supabase } from '@/lib/supabase'

export interface GoogleAuthResult {
  success: boolean
  error?: Error | null
}

export interface UseGoogleAuthReturn {
  /** Googleログインを実行 */
  signInWithGoogle: (options?: GoogleAuthOptions) => Promise<GoogleAuthResult>
  /** Googleカレンダー連携を実行 */
  connectGoogleCalendar: () => Promise<GoogleAuthResult>
  /** ローディング状態 */
  loading: boolean
  /** エラーメッセージ */
  error: string | null
  /** エラーをクリア */
  clearError: () => void
}

/**
 * Google認証フック
 */
export const useGoogleAuth = (): UseGoogleAuthReturn => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Googleでサインイン
   */
  const signInWithGoogle = useCallback(
    async (options?: GoogleAuthOptions): Promise<GoogleAuthResult> => {
      if (!supabase) {
        setError('Supabaseクライアントが初期化されていません')
        return { success: false, error: new Error('Supabaseクライアントが初期化されていません') }
      }

      setLoading(true)
      setError(null)

      try {
        // OAuth URLを構築
        const { url, redirectUri } = buildGoogleAuthUrl(options)

        if (__DEV__) {
          console.log('=== Google OAuth Debug ===')
          // URLからトークンを含む可能性のあるフラグメントを除去してログ出力
          const maskSensitiveUrl = (urlStr: string) => {
            const hashIndex = urlStr.indexOf('#')
            return hashIndex !== -1 ? `${urlStr.substring(0, hashIndex)}#[MASKED]` : urlStr
          }
          console.log('OAuth URL (masked):', maskSensitiveUrl(url))
          console.log('Redirect URI:', redirectUri)
          console.log('=========================')
        }

        // システムブラウザで認証画面を開く
        const result = await WebBrowser.openAuthSessionAsync(url, redirectUri)

        if (__DEV__) {
          console.log('WebBrowser result type:', result.type)
        }

        if (result.type === 'success' && result.url) {
          if (__DEV__) {
            // URLフラグメントにトークンが含まれるため、マスクして出力
            const callbackBase = result.url.split('#')[0]
            console.log('Callback URL (base only):', callbackBase)
          }

          // コールバックURLからトークンを抽出
          const tokens = extractTokensFromUrl(result.url)

          if (__DEV__) {
            console.log('Extracted tokens:', {
              hasAccessToken: !!tokens.accessToken,
              hasRefreshToken: !!tokens.refreshToken,
              hasProviderToken: !!tokens.providerToken,
              hasProviderRefreshToken: !!tokens.providerRefreshToken,
              error: tokens.error,
            })
          }

          if (tokens.error) {
            setError(tokens.error)
            return { success: false, error: new Error(tokens.error) }
          }

          if (tokens.accessToken && tokens.refreshToken) {
            // Supabaseセッションを設定
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: tokens.accessToken,
              refresh_token: tokens.refreshToken,
            })

            if (sessionError) {
              console.error('Session error:', sessionError)
              setError(sessionError.message)
              return { success: false, error: sessionError }
            }

            if (__DEV__) {
              console.log('Session set successfully!')
            }

            // カレンダー連携の場合、provider_refresh_tokenを保存してフラグを更新
            // Web APIを経由してトークンを保存（pgsodiumの権限問題を回避）
            if (options?.forCalendarConnect && tokens.providerRefreshToken) {
              if (__DEV__) {
                console.log('Saving Google Calendar tokens via Web API...')
              }

              try {
                const webApiUrl = globalThis.__SWIM_HUB_WEB_API_URL__ || 'https://swim-hub.app'
                const response = await fetch(`${webApiUrl}/api/google-calendar/connect`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${tokens.accessToken}`,
                  },
                  body: JSON.stringify({
                    providerRefreshToken: tokens.providerRefreshToken,
                  }),
                })

                if (response.ok) {
                  if (__DEV__) {
                    console.log('Google Calendar tokens saved successfully via Web API!')
                  }
                } else {
                  const errorData = await response.json().catch(() => ({})) as { error?: string }
                  console.error('Failed to save Google Calendar tokens:', errorData.error || response.status)
                }
              } catch (err) {
                console.error('Failed to connect to Web API:', err)
              }
            }

            return { success: true }
          }

          // access_tokenのみの場合（refresh_tokenがない場合）
          if (tokens.accessToken) {
            // ユーザー情報を取得してセッションを確認
            const { data: { user }, error: userError } = await supabase.auth.getUser(tokens.accessToken)

            if (userError || !user) {
              setError('ユーザー情報の取得に失敗しました')
              return { success: false, error: userError || new Error('ユーザー情報の取得に失敗しました') }
            }

            // セッションを設定（refresh_tokenがない場合はダミーを使用）
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: tokens.accessToken,
              refresh_token: tokens.refreshToken || '',
            })

            if (sessionError) {
              setError(sessionError.message)
              return { success: false, error: sessionError }
            }

            return { success: true }
          }

          setError('認証トークンが取得できませんでした')
          return { success: false, error: new Error('認証トークンが取得できませんでした') }
        }

        if (result.type === 'cancel') {
          setError('認証がキャンセルされました')
          return { success: false, error: new Error('認証がキャンセルされました') }
        }

        if (result.type === 'dismiss') {
          // ユーザーがブラウザを閉じた場合
          setError('認証が中断されました')
          return { success: false, error: new Error('認証が中断されました') }
        }

        setError('認証に失敗しました')
        return { success: false, error: new Error('認証に失敗しました') }
      } catch (err) {
        console.error('Google auth error:', err)
        const errorMessage = err instanceof Error ? err.message : '不明なエラーが発生しました'
        setError(errorMessage)
        return { success: false, error: err instanceof Error ? err : new Error(errorMessage) }
      } finally {
        setLoading(false)
      }
    },
    []
  )

  /**
   * Googleカレンダー連携
   * カレンダー権限を持つスコープで認証を実行
   */
  const connectGoogleCalendar = useCallback(async (): Promise<GoogleAuthResult> => {
    return signInWithGoogle({ forCalendarConnect: true })
  }, [signInWithGoogle])

  /**
   * エラーをクリア
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    signInWithGoogle,
    connectGoogleCalendar,
    loading,
    error,
    clearError,
  }
}
