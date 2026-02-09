/**
 * Google OAuth認証ユーティリティ
 * Expo + Supabase でのGoogle認証フローを管理
 */
import { makeRedirectUri } from 'expo-auth-session'

/**
 * リダイレクトURIを生成
 * カスタムスキーム(swimhub://)を使用
 */
export const getRedirectUri = (): string => {
  // iOS/Androidのスタンドアロンビルドでは`native`パラメータで
  // 明示的にカスタムスキームURIを指定する必要がある
  return makeRedirectUri({
    scheme: 'swimhub',
    path: 'auth/callback',
    // プロダクションビルドで正しいリダイレクトURIを生成するため
    native: 'swimhub://auth/callback',
  })
}

export interface GoogleAuthOptions {
  /** 追加のOAuthスコープ */
  scopes?: string[]
  /** カレンダー連携用の認証かどうか */
  forCalendarConnect?: boolean
}

/**
 * コールバックURLからトークンを抽出
 * Supabaseは認証成功後、フラグメント(#)でトークンを返す
 */
export interface ExtractedTokens {
  accessToken: string | null
  refreshToken: string | null
  expiresIn: number | null
  tokenType: string | null
  /** Googleのアクセストークン（Google API呼び出し用） */
  providerToken: string | null
  /** Googleのリフレッシュトークン（カレンダー連携用に保存が必要） */
  providerRefreshToken: string | null
  error: string | null
}

export const extractTokensFromUrl = (url: string): ExtractedTokens => {
  try {
    const urlObj = new URL(url)

    // フラグメント(#)からパラメータを取得
    const hashParams = new URLSearchParams(urlObj.hash.substring(1))

    // エラーチェック
    const error = hashParams.get('error_description') || hashParams.get('error')
    if (error) {
      return {
        accessToken: null,
        refreshToken: null,
        expiresIn: null,
        tokenType: null,
        providerToken: null,
        providerRefreshToken: null,
        error,
      }
    }

    // トークンを抽出
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    const expiresIn = hashParams.get('expires_in')
    const tokenType = hashParams.get('token_type')
    // Googleのトークン（カレンダー連携用）
    const providerToken = hashParams.get('provider_token')
    const providerRefreshToken = hashParams.get('provider_refresh_token')

    return {
      accessToken,
      refreshToken,
      expiresIn: expiresIn ? parseInt(expiresIn, 10) : null,
      tokenType,
      providerToken,
      providerRefreshToken,
      error: null,
    }
  } catch {
    return {
      accessToken: null,
      refreshToken: null,
      expiresIn: null,
      tokenType: null,
      providerToken: null,
      providerRefreshToken: null,
      error: 'URLの解析に失敗しました',
    }
  }
}
