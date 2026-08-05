/**
 * OAuth コールバック URL (カスタムスキーム) から、PKCE の認可コード・implicit
 * フローのトークン・エラー情報を抽出する。
 *
 * Supabase クライアントが flowType: "pkce" で構成されている場合、コールバックは
 * 通常クエリパラメータ `?code=...` で認可コードが返る。flowType: "implicit" の
 * 場合や PKCE がフォールバックした場合は、フラグメント `#access_token=...` で
 * トークンが直接返る。呼び出し側 (signInWithGoogle) は code を優先して
 * exchangeCodeForSession を試み、無ければ implicit のトークンにフォールバックする。
 *
 * `recoveryType` (パスワードリセット判定用) と `providerToken`/`providerRefreshToken`
 * (Google Calendar 連携等、implicit フォールバック時のみ意味を持つ) は、3アプリの
 * うち一部でしか使われていないフィールドのため、明示的な opt-in (options) が
 * 無い限り常に null を返す。
 */
export interface ExtractTokensOptions {
  /** フラグメントの `type` パラメータを recoveryType に反映するか。既定 false。 */
  includeRecoveryType?: boolean;
  /** フラグメントの `provider_token`/`provider_refresh_token` を反映するか。既定 false。 */
  includeProviderTokens?: boolean;
}

export interface ExtractedTokens {
  accessToken: string | null;
  refreshToken: string | null;
  expiresIn: number | null;
  tokenType: string | null;
  /** PKCE フロー時にクエリパラメータで返る認可コード */
  code: string | null;
  /** Supabase が implicit フローのフラグメントに付与する `type` パラメータ (例: "recovery") */
  recoveryType: string | null;
  /** OAuth プロバイダのアクセストークン (implicit フォールバック時のみ) */
  providerToken: string | null;
  /** OAuth プロバイダのリフレッシュトークン (implicit フォールバック時のみ) */
  providerRefreshToken: string | null;
  error: string | null;
}

const emptyTokens = (error: string | null): ExtractedTokens => ({
  accessToken: null,
  refreshToken: null,
  expiresIn: null,
  tokenType: null,
  code: null,
  recoveryType: null,
  providerToken: null,
  providerRefreshToken: null,
  error,
});

export const extractTokensFromUrl = (url: string, options?: ExtractTokensOptions): ExtractedTokens => {
  const includeRecoveryType = options?.includeRecoveryType ?? false;
  const includeProviderTokens = options?.includeProviderTokens ?? false;

  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch {
    // 不正な URL・空文字。呼び出し元 (各アプリ) の i18n に依存しない、
    // アプリ非依存の機械可読な固定コードを返す。ローカライズは呼び出し側の責務。
    return emptyTokens("invalid_url");
  }

  const hashParams = new URLSearchParams(urlObj.hash.substring(1));
  const queryParams = urlObj.searchParams;

  // OAuth プロバイダ / Supabase 側のエラーは PKCE (query) と implicit (hash) の
  // どちらの形式でも返りうるため両方確認する。優先順位:
  // hash.error_description > hash.error > query.error_description > query.error
  const error =
    hashParams.get("error_description") ||
    hashParams.get("error") ||
    queryParams.get("error_description") ||
    queryParams.get("error");
  if (error) {
    return emptyTokens(error);
  }

  const expiresInRaw = hashParams.get("expires_in");

  return {
    accessToken: hashParams.get("access_token"),
    refreshToken: hashParams.get("refresh_token"),
    expiresIn: expiresInRaw ? parseInt(expiresInRaw, 10) : null,
    tokenType: hashParams.get("token_type"),
    code: queryParams.get("code"),
    recoveryType: includeRecoveryType ? hashParams.get("type") : null,
    providerToken: includeProviderTokens ? hashParams.get("provider_token") : null,
    providerRefreshToken: includeProviderTokens ? hashParams.get("provider_refresh_token") : null,
    error: null,
  };
};
