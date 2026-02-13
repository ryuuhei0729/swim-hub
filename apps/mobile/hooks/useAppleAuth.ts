/**
 * Apple認証フック
 * expo-apple-authenticationを使用してネイティブのApple認証を実行
 */
import { useState, useCallback } from 'react'
import * as AppleAuthentication from 'expo-apple-authentication'
import { Platform } from 'react-native'
import { supabase } from '@/lib/supabase'
import { localizeSupabaseAuthError } from '@/utils/authErrorLocalizer'

export interface AppleAuthResult {
  success: boolean
  error?: Error | null
}

/**
 * expo-apple-authenticationのエラーコード
 */
type AppleAuthErrorCode =
  | 'ERR_REQUEST_CANCELED'
  | 'ERR_REQUEST_FAILED'
  | 'ERR_REQUEST_INVALID'
  | 'ERR_REQUEST_NOT_HANDLED'
  | 'ERR_REQUEST_UNKNOWN'

/**
 * Apple認証エラー型
 */
type AppleAuthError = Error & { code?: AppleAuthErrorCode }

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
      })

      if (signInError) {
        setError(localizeSupabaseAuthError(signInError))
        return { success: false, error: signInError }
      }

      // ユーザー名が取得できた場合はメタデータを更新
      if (displayName) {
        await supabase.auth.updateUser({
          data: { name: displayName },
        })
      }

      return { success: true }
    } catch (e) {
      const err = e as AppleAuthError

      // ユーザーがキャンセルした場合
      // ERR_REQUEST_CANCELED: 明示的なキャンセル
      // ERR_REQUEST_UNKNOWN + "authorization attempt failed": ダイアログを閉じた場合
      if (
        err.code === 'ERR_REQUEST_CANCELED' ||
        (err.code === 'ERR_REQUEST_UNKNOWN' && err.message?.toLowerCase().includes('authorization attempt failed'))
      ) {
        setError('認証がキャンセルされました')
        return { success: false, error: new Error('認証がキャンセルされました') }
      }

      const rawMessage = err.message || '不明なエラーが発生しました'
      const localizedMessage = localizeSupabaseAuthError({ message: rawMessage })
      setError(localizedMessage)
      return { success: false, error: err }
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
