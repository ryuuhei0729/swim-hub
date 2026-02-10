/**
 * Supabase認証エラーメッセージの日本語化ユーティリティ
 */

// React Nativeのグローバル変数を宣言
declare const __DEV__: boolean

/**
 * 既知のSupabaseエラーメッセージを日本語にマッピング
 */
export const errorMessageMap: Record<string, string> = {
  // 認証関連
  'invalid login credentials': 'メールアドレスまたはパスワードが正しくありません',
  'invalid credentials': '認証情報が正しくありません',
  'email not confirmed': 'メールアドレスが確認されていません。確認メールをご確認ください',
  'user not found': 'ユーザーが見つかりません',
  'user already registered': 'このメールアドレスは既に登録されています',
  'email already in use': 'このメールアドレスは既に使用されています',

  // OAuth関連
  'provider not enabled': 'この認証プロバイダーは有効化されていません',
  'oauth error': 'OAuth認証でエラーが発生しました',
  'access_denied': 'アクセスが拒否されました',
  'invalid_grant': '認証の有効期限が切れました。再度お試しください',
  'invalid_request': 'リクエストが無効です',
  'unauthorized_client': '認証が許可されていません',
  'unsupported_grant_type': 'サポートされていない認証タイプです',

  // トークン関連
  'invalid token': '認証トークンが無効です',
  'token expired': '認証トークンの有効期限が切れました',
  'invalid refresh token': 'リフレッシュトークンが無効です',
  'refresh token not found': 'リフレッシュトークンが見つかりません',
  'invalid id token': 'IDトークンが無効です',
  'id token expired': 'IDトークンの有効期限が切れました',

  // セッション関連
  'session not found': 'セッションが見つかりません。再度ログインしてください',
  'session expired': 'セッションの有効期限が切れました。再度ログインしてください',
  'invalid session': 'セッションが無効です',

  // レート制限
  'too many requests': 'リクエスト回数が上限に達しました。しばらくお待ちください',
  'rate limit exceeded': 'リクエスト制限を超えました。しばらくお待ちください',

  // ネットワーク関連
  'network error': 'ネットワークエラーが発生しました。接続を確認してください',
  'connection refused': '接続が拒否されました。しばらくしてから再度お試しください',
  'timeout': '接続がタイムアウトしました。再度お試しください',

  // Apple認証関連
  'apple authentication failed': 'Apple認証に失敗しました',
  'apple sign in failed': 'Appleサインインに失敗しました',

  // Google認証関連
  'google authentication failed': 'Google認証に失敗しました',
  'google sign in failed': 'Googleサインインに失敗しました',

  // サーバーエラー
  'internal server error': 'サーバーエラーが発生しました。しばらくしてから再度お試しください',
  'service unavailable': 'サービスが一時的に利用できません。しばらくしてから再度お試しください',
  'bad gateway': 'サーバーとの通信に問題が発生しました',
}

/**
 * エラーメッセージを日本語に変換する
 * @param message 元のエラーメッセージ（英語）
 * @returns 日本語のエラーメッセージ
 */
export const localizeAuthError = (message: string): string => {
  if (!message) {
    return '認証エラーが発生しました。再度お試しください'
  }

  const lowerMessage = message.toLowerCase()

  // 完全一致を優先
  for (const [key, value] of Object.entries(errorMessageMap)) {
    if (lowerMessage === key) {
      return value
    }
  }

  // 部分一致を検索
  for (const [key, value] of Object.entries(errorMessageMap)) {
    if (lowerMessage.includes(key)) {
      return value
    }
  }

  // キャンセル関連のエラーはそのまま（既に日本語の場合が多い）
  if (lowerMessage.includes('cancel') || lowerMessage.includes('キャンセル')) {
    return '認証がキャンセルされました'
  }

  // 既に日本語のメッセージはそのまま返す
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(message)) {
    return message
  }

  // 開発環境では元のメッセージも表示
  if (__DEV__) {
    return `認証エラーが発生しました: ${message}`
  }

  // 本番環境ではジェネリックなメッセージ
  return '認証エラーが発生しました。再度お試しください'
}

/**
 * Supabase AuthError オブジェクトからローカライズされたメッセージを取得
 * @param error Supabase AuthError または Error オブジェクト
 * @returns 日本語のエラーメッセージ
 */
export const localizeSupabaseAuthError = (error: { message?: string; error_description?: string; error?: string } | null | undefined): string => {
  if (!error) {
    return '認証エラーが発生しました。再度お試しください'
  }

  const message = error.message || error.error_description || error.error || ''
  return localizeAuthError(message)
}
