/**
 * Apple OAuth認証ユーティリティ
 * expo-apple-authenticationを使用してネイティブApple認証を実行
 */
import * as AppleAuthentication from 'expo-apple-authentication'

export interface AppleAuthResult {
  identityToken: string
  user: string
  email: string | null
  fullName: {
    givenName: string | null
    familyName: string | null
  } | null
}

/**
 * Apple Sign In が利用可能かチェック
 * iOS 13以降でのみ利用可能
 */
export const isAppleAuthAvailable = async (): Promise<boolean> => {
  try {
    return await AppleAuthentication.isAvailableAsync()
  } catch {
    return false
  }
}

/**
 * Apple Sign In を実行
 * @returns Apple認証結果（identityToken, user, email, fullName）
 * @throws Apple認証に失敗した場合
 */
export const signInWithApple = async (): Promise<AppleAuthResult> => {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  })

  if (!credential.identityToken) {
    throw new Error('Apple認証トークンが取得できませんでした')
  }

  return {
    identityToken: credential.identityToken,
    user: credential.user,
    email: credential.email,
    fullName: credential.fullName,
  }
}

/**
 * Apple認証のエラーコードを判定
 */
export const isAppleAuthCancelled = (error: unknown): boolean => {
  if (error && typeof error === 'object' && 'code' in error) {
    const err = error as { code: string }
    return err.code === 'ERR_REQUEST_CANCELED'
  }
  return false
}
