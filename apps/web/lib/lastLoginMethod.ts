// =============================================================================
// 直近で利用したログイン手法の記録
// =============================================================================
//
// ログイン画面で「直近で利用」ラベルを出すため、最後に成功したログイン手法を覚えておく。
// ログアウト時の clearAllClientState() が localStorage / sessionStorage を全消去するため、
// それらではなく Cookie に置く（ログアウト後に表示するのが目的なので消えてはいけない）。
//
// 書き込みはログイン成功が確定した場所だけで行う:
// - メール: AuthProvider.signIn の成功時 (クライアント)
// - Google / Apple: /api/auth/callback でセッションが確立した時 (サーバー)
// ログイン画面から JS で読むため httpOnly にはしない。

export type LoginMethod = "google" | "apple" | "email";

export const LAST_LOGIN_METHOD_COOKIE = "swimhub_last_login_method";
export const LAST_LOGIN_METHOD_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** OAuth の redirectTo に載せ、コールバックで成功時に記録するためのクエリパラメータ名 */
export const LOGIN_METHOD_QUERY_PARAM = "login_method";

const LOGIN_METHODS: readonly LoginMethod[] = ["google", "apple", "email"];

export function isLoginMethod(value: unknown): value is LoginMethod {
  return typeof value === "string" && (LOGIN_METHODS as readonly string[]).includes(value);
}

/** 覚えている手法を返す。未保存のときは null */
export function getLastLoginMethod(): LoginMethod | null {
  if (typeof document === "undefined") return null;
  const prefix = `${LAST_LOGIN_METHOD_COOKIE}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      const value = decodeURIComponent(trimmed.slice(prefix.length));
      return isLoginMethod(value) ? value : null;
    }
  }
  return null;
}

/** ログイン成功時に呼ぶ (クライアント側) */
export function setLastLoginMethod(method: LoginMethod): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LAST_LOGIN_METHOD_COOKIE}=${method}; Path=/; Max-Age=${LAST_LOGIN_METHOD_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}
