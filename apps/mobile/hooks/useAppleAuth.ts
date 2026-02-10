/**
 * Apple認証フック
 * expo-apple-authenticationを使用してネイティブのApple認証を実行
 */
import { useState, useCallback } from 'react'
import * as AppleAuthentication from 'expo-apple-authentication'
import { Platform } from 'react-native'
import { supabase } from '@/lib/supabase'

export interface AppleAuthResult {
  success: boolean
  error?: Error | null
}

export interface UseAppleAuthReturn {
  /** Appleログインを実行 */
  signInWithApple: () => Promise<AppleAuthResult>
  /** ローディング状態 */
  loading: boolean
  /** エラーメッセージ */
  error: string | null
  /** エラーをクリア */
  clearError: () => void
  /** Apple認証が利用可能かどうか */
  isAvailable: boolean
}

/**
 * Apple認証フック
 */
export const useAppleAuth = (): UseAppleAuthReturn => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // iOSでのみ利用可能
  const isAvailable = Platform.OS === 'ios'

  /**
   * Appleでサインイン
   */
  const signInWithApple = useCallback(async (): Promise<AppleAuthResult> => {
    if (!isAvailable) {
      setError('Apple認証はiOSでのみ利用可能です')
      return { success: false, error: new Error('Apple認証はiOSでのみ利用可能です') }
    }

    if (!supabase) {
      setError('Supabaseクライアントが初期化されていません')
      return { success: false, error: new Error('Supabaseクライアントが初期化されていません') }
    }

    setLoading(true)
    setError(null)

    try {
      // Apple認証が利用可能かチェック
      const isAppleAuthAvailable = await AppleAuthentication.isAvailableAsync()
      if (!isAppleAuthAvailable) {
        setError('このデバイスではApple認証を利用できません')
        return { success: false, error: new Error('このデバイスではApple認証を利用できません') }
      }

      // ネイティブのApple認証UIを表示
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      })

      // identityTokenが必要
      if (!credential.identityToken) {
        setError('Apple認証トークンが取得できませんでした')
        return { success: false, error: new Error('Apple認証トークンが取得できませんでした') }
      }

      // ユーザー名を取得（初回のみ取得可能）
      const fullName = credential.fullName
      const displayName = fullName
        ? [fullName.familyName, fullName.givenName].filter(Boolean).join(' ')
        : undefined

      // Supabaseに認証トークンを渡してサインイン
      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        options: displayName ? {
          data: {
            name: displayName,
          },
        } : undefined,
      })

      if (signInError) {
        setError(signInError.message)
        return { success: false, error: signInError }
      }

      return { success: true }
    } catch (err) {
      // ユーザーがキャンセルした場合
      if (err instanceof Error && err.message.includes('ERR_REQUEST_CANCELED')) {
        setError('認証がキャンセルされました')
        return { success: false, error: new Error('認証がキャンセルされました') }
      }

      const errorMessage = err instanceof Error ? err.message : '不明なエラーが発生しました'
      setError(errorMessage)
      return { success: false, error: err instanceof Error ? err : new Error(errorMessage) }
    } finally {
      setLoading(false)
    }
  }, [isAvailable])

  /**
   * エラーをクリア
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    signInWithApple,
    loading,
    error,
    clearError,
    isAvailable,
  }
}
