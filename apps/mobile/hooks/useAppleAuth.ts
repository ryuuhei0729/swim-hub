/**
 * Apple認証フック
 * expo-apple-authenticationを使用してネイティブ認証を実行し、
 * Supabaseでセッションを確立する
 */
import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  isAppleAuthAvailable,
  signInWithApple as appleSignIn,
  isAppleAuthCancelled,
} from '@/lib/apple-auth'

export interface AppleAuthResult {
  success: boolean
  error?: Error | null
}

export interface UseAppleAuthReturn {
  /** Appleログインを実行 */
  signInWithApple: () => Promise<AppleAuthResult>
  /** Apple Sign Inが利用可能か */
  isAvailable: boolean
  /** ローディング状態 */
  loading: boolean
  /** エラーメッセージ */
  error: string | null
  /** エラーをクリア */
  clearError: () => void
}

export const useAppleAuth = (): UseAppleAuthReturn => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAvailable, setIsAvailable] = useState(false)

  // Apple Sign In利用可能かチェック
  useEffect(() => {
    isAppleAuthAvailable().then(setIsAvailable)
  }, [])

  const signInWithApple = useCallback(async (): Promise<AppleAuthResult> => {
    if (!supabase) {
      setError('Supabaseクライアントが初期化されていません')
      return { success: false, error: new Error('Supabaseクライアントが初期化されていません') }
    }

    setLoading(true)
    setError(null)

    try {
      // Apple認証を実行
      const { identityToken } = await appleSignIn()

      // SupabaseでID Tokenを使用してセッションを確立
      const { error: sessionError } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: identityToken,
      })

      if (sessionError) {
        setError(sessionError.message)
        return { success: false, error: sessionError }
      }

      return { success: true }
    } catch (err) {
      // ユーザーがキャンセルした場合は静かに終了
      if (isAppleAuthCancelled(err)) {
        return { success: false }
      }

      const errorMessage = err instanceof Error ? err.message : '不明なエラーが発生しました'
      setError(errorMessage)
      return { success: false, error: err instanceof Error ? err : new Error(errorMessage) }
    } finally {
      setLoading(false)
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return {
    signInWithApple,
    isAvailable,
    loading,
    error,
    clearError,
  }
}
