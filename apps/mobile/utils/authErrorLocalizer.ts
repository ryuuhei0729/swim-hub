// =============================================================================
// Supabase 認証エラーメッセージのロケール対応ユーティリティ
// =============================================================================
// Supabase が返す英語エラーメッセージ (lowercase) をキーとして i18n の
// auth.errors.<key> を引く。マップにないキーはジェネリックなメッセージで返す。

import i18n from "@/i18n";

declare const __DEV__: boolean;

const ERROR_I18N_KEYS = [
  "invalidLoginCredentials",
  "invalidCredentials",
  "emailNotConfirmed",
  "userNotFound",
  "userAlreadyRegistered",
  "emailAlreadyInUse",
  "providerNotEnabled",
  "oauthError",
  "accessDenied",
  "invalidGrant",
  "invalidRequest",
  "unauthorizedClient",
  "unsupportedGrantType",
  "invalidToken",
  "tokenExpired",
  "invalidRefreshToken",
  "refreshTokenNotFound",
  "invalidIdToken",
  "idTokenExpired",
  "sessionNotFound",
  "sessionExpired",
  "invalidSession",
  "tooManyRequests",
  "rateLimitExceeded",
  "networkError",
  "connectionRefused",
  "timeout",
  "appleAuthFailed",
  "appleSignInFailed",
  "googleAuthFailed",
  "googleSignInFailed",
  "internalServerError",
  "serviceUnavailable",
  "badGateway",
] as const;

const MATCH_PATTERN_TO_KEY: Array<[string, (typeof ERROR_I18N_KEYS)[number]]> = [
  ["invalid login credentials", "invalidLoginCredentials"],
  ["invalid credentials", "invalidCredentials"],
  ["email not confirmed", "emailNotConfirmed"],
  ["user not found", "userNotFound"],
  ["user already registered", "userAlreadyRegistered"],
  ["email already in use", "emailAlreadyInUse"],
  ["provider not enabled", "providerNotEnabled"],
  ["oauth error", "oauthError"],
  ["access_denied", "accessDenied"],
  ["invalid_grant", "invalidGrant"],
  ["invalid_request", "invalidRequest"],
  ["unauthorized_client", "unauthorizedClient"],
  ["unsupported_grant_type", "unsupportedGrantType"],
  ["invalid token", "invalidToken"],
  ["token expired", "tokenExpired"],
  ["invalid refresh token", "invalidRefreshToken"],
  ["refresh token not found", "refreshTokenNotFound"],
  ["invalid id token", "invalidIdToken"],
  ["id token expired", "idTokenExpired"],
  ["session not found", "sessionNotFound"],
  ["session expired", "sessionExpired"],
  ["invalid session", "invalidSession"],
  ["too many requests", "tooManyRequests"],
  ["rate limit exceeded", "rateLimitExceeded"],
  ["network error", "networkError"],
  ["connection refused", "connectionRefused"],
  ["timeout", "timeout"],
  ["apple authentication failed", "appleAuthFailed"],
  ["apple sign in failed", "appleSignInFailed"],
  ["google authentication failed", "googleAuthFailed"],
  ["google sign in failed", "googleSignInFailed"],
  ["internal server error", "internalServerError"],
  ["service unavailable", "serviceUnavailable"],
  ["bad gateway", "badGateway"],
];

/** エラーメッセージを現在のロケールに合わせて変換する */
export const localizeAuthError = (message: string): string => {
  if (!message) return i18n.t("auth.supabaseErrors.generic");

  const lowerMessage = message.toLowerCase();

  for (const [pattern, key] of MATCH_PATTERN_TO_KEY) {
    if (lowerMessage === pattern) return i18n.t(`auth.supabaseErrors.${key}`);
  }
  for (const [pattern, key] of MATCH_PATTERN_TO_KEY) {
    if (lowerMessage.includes(pattern)) return i18n.t(`auth.supabaseErrors.${key}`);
  }

  if (lowerMessage.includes("cancel") || lowerMessage.includes("キャンセル")) {
    return i18n.t("auth.supabaseErrors.cancelled");
  }

  // 既にロケール固有 (ja の場合) のメッセージはそのまま返す
  if (/[぀-ゟ゠-ヿ一-龯]/.test(message)) return message;

  if (__DEV__) return i18n.t("auth.supabaseErrors.genericWithDetail", { detail: message });

  return i18n.t("auth.supabaseErrors.generic");
};

/** Supabase AuthError オブジェクト経由でロケール対応メッセージを取得 */
export const localizeSupabaseAuthError = (
  error: { message?: string; error_description?: string; error?: string } | null | undefined,
): string => {
  if (!error) return i18n.t("auth.supabaseErrors.generic");
  const message = error.message || error.error_description || error.error || "";
  return localizeAuthError(message);
};

// 互換性のため一覧をエクスポート (既存テスト等で参照される可能性)
export const ERROR_KEYS: readonly string[] = ERROR_I18N_KEYS;

/**
 * 既存テスト・コード互換: 「英語パターン → ロケール対応メッセージ」の辞書を返す。
 * 現在のロケールに合わせて動的に解決されるので、テスト時 (ja モック) では
 * 旧来の日本語固定マップと等価に振る舞う。
 */
export const errorMessageMap: Record<string, string> = new Proxy({} as Record<string, string>, {
  get(_target, prop: string) {
    const key = MATCH_PATTERN_TO_KEY.find(([pattern]) => pattern === prop)?.[1];
    return key ? i18n.t(`auth.supabaseErrors.${key}`) : undefined;
  },
  ownKeys() {
    return MATCH_PATTERN_TO_KEY.map(([pattern]) => pattern);
  },
  getOwnPropertyDescriptor(_target, prop: string) {
    const key = MATCH_PATTERN_TO_KEY.find(([pattern]) => pattern === prop)?.[1];
    if (!key) return undefined;
    return {
      value: i18n.t(`auth.supabaseErrors.${key}`),
      writable: false,
      enumerable: true,
      configurable: true,
    };
  },
});
