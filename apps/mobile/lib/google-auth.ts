/**
 * Google OAuth認証ユーティリティ
 * Expo + Supabase でのGoogle認証フローを管理
 *
 * 注意: このファイルは `lib/__tests__/google-auth.calendarConnectPending.test.ts` や
 * `__tests__/lib/emailDeepLink.test.ts` など、expo-web-browser を一切モックしない
 * テストからも直接 import される。共有パッケージ (@ryuuhei0729/swimhub-oauth/mobile)
 * の `/mobile` エントリは signInWithGoogle.ts (expo-web-browser に依存) を含む
 * 全submoduleを1つの index にまとめてバンドルしているため、ここでこのエントリを
 * import すると (どの named export を使うかに関わらず) expo-web-browser が
 * 無条件で読み込まれ、モックしていないテストがクラッシュする。
 * そのため `claimOAuthCode` / `signInWithGoogle` は、既に expo-web-browser を
 * 直接 import している (かつテストでモック済みの) hooks/useGoogleAuth.ts /
 * contexts/AuthProvider.tsx / components/settings/IdentityLinkSettings.tsx から
 * 共有パッケージを直接 import すること。
 * `extractTokensFromUrl` だけは `@ryuuhei0729/swimhub-oauth/mobile/pure`
 * (expo-web-browser / expo-auth-session のどちらにも依存しない純粋関数のみの
 * サブパス) から import している。`getRedirectUri` は含めない: expo-auth-session
 * の AuthSession.js が expo-web-browser を静的 import しているため、
 * makeRedirectUri だけを使う場合でも expo-web-browser が読み込まれてしまう
 * (実測確認済み)。そのためこの関数だけはローカル実装を維持する。
 */
import { makeRedirectUri } from "expo-auth-session";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  extractTokensFromUrl as sharedExtractTokensFromUrl,
  type ExtractedTokens,
  type ExtractTokensOptions,
} from "@ryuuhei0729/swimhub-oauth/mobile/pure";
import i18n from "@/i18n";
import { localizeAuthError } from "@/utils/authErrorLocalizer";

/**
 * このアプリのカスタム URL スキーム。共有パッケージの signInWithGoogle / getRedirectUri
 * に渡す scheme と、AuthProvider / IdentityLinkSettings のディープリンク判定
 * (swimhub://auth/callback) の両方が同じ値を前提にしている。
 */
export const APP_SCHEME = "swimhub";

/**
 * openAuthSessionAsync 進行中に AuthProvider のグローバル Linking ハンドラが
 * 同一 URL を二重処理しないよう抑制するフラグ。
 * setSession 完了後に解除すること。
 */
export const oauthSessionGuard = { active: false };

/**
 * Googleカレンダー連携の OAuth ブラウザ操作が進行中であることを示す永続フラグのキー。
 * Android の Custom Tabs は別プロセスで開くため、同意画面操作中に OS がアプリ
 * プロセスを kill しうる。その場合 oauthSessionGuard はインメモリのため失われるが、
 * このフラグは AsyncStorage 永続化されているため、コールドスタート後の
 * ディープリンクハンドラ (AuthProvider) が「連携が中断していた」ことを検知できる。
 */
const CALENDAR_CONNECT_PENDING_KEY = "swimhub:googleCalendarConnectPending";

/** フラグの有効期限（この時間を超えたら誤検知防止のため通常のコールバックとして扱う） */
const CALENDAR_CONNECT_PENDING_TTL_MS = 10 * 60 * 1000;

/** カレンダー連携用の OAuth ブラウザを開く直前に呼び出す */
export const markCalendarConnectPending = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(CALENDAR_CONNECT_PENDING_KEY, String(Date.now()));
  } catch (err) {
    // 保存に失敗してもコールドスタート検知ができなくなるだけで致命的ではない
    console.error("markCalendarConnectPending 失敗:", err);
  }
};

/** warm path（ブラウザ操作がプロセス継続中に完了）で正常終了した際にフラグを消す */
export const clearCalendarConnectPending = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(CALENDAR_CONNECT_PENDING_KEY);
  } catch (err) {
    console.error("clearCalendarConnectPending 失敗:", err);
  }
};

/**
 * フラグを読み取った直後に削除する。
 * 注意: getItem → removeItem の間はアトミックではないため、理論上ごく短時間に
 * 連続で呼び出された場合は両方が同じ値を読める可能性がある。ディープリンク
 * ハンドラの実際の呼び出しパターン（同一 URL に対して短時間に多重発火しても
 * ミリ秒単位のごく僅かな窓）ではこの競合は実質問題にならない想定だが、
 * 「呼び出し側の排他制御」を代替するものではない点に留意すること。
 * 有効期限切れの場合は false を返し、通常のメール確認コールバックとして処理させる。
 */
export const consumeCalendarConnectPending = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(CALENDAR_CONNECT_PENDING_KEY);
    await AsyncStorage.removeItem(CALENDAR_CONNECT_PENDING_KEY);
    if (!value) return false;
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp)) return false;
    return Date.now() - timestamp < CALENDAR_CONNECT_PENDING_TTL_MS;
  } catch (err) {
    console.error("consumeCalendarConnectPending 失敗:", err);
    return false;
  }
};

/**
 * カレンダー連携フローであることを示すコールバック URL のクエリパラメータ。
 * `getRedirectUri({ forCalendarConnect: true })` が生成する redirectTo にのみ付与され、
 * Supabase はこれをクエリ文字列に保持したままコールバックを返す
 * （flowType: "pkce" の現在は `?code=...` と併存するクエリパラメータ。
 * implicit フォールバック時のみ、このクエリはフラグメント(#access_token=...)と併存する）。
 * AuthProvider のディープリンクハンドラがコールドスタート復帰時にこのフラグを見て、
 * 無関係な認証コールバック（メール確認・通常ログイン）との誤判定を防ぐ。
 */
export const CALENDAR_CONNECT_FLOW_PARAM = "flow=calendar-connect";

/**
 * リダイレクトURIを生成
 * カスタムスキーム(swimhub://)を使用
 */
export const getRedirectUri = (options?: { forCalendarConnect?: boolean }): string => {
  const nativeUri = options?.forCalendarConnect
    ? `swimhub://auth/callback?${CALENDAR_CONNECT_FLOW_PARAM}`
    : "swimhub://auth/callback";

  // iOS/Androidのスタンドアロンビルドでは`native`パラメータで
  // 明示的にカスタムスキームURIを指定する必要がある
  return makeRedirectUri({
    scheme: "swimhub",
    path: "auth/callback",
    // プロダクションビルドで正しいリダイレクトURIを生成するため
    native: nativeUri,
  });
};

export interface GoogleAuthOptions {
  /** 追加のOAuthスコープ */
  scopes?: string[];
  /** カレンダー連携用の認証かどうか */
  forCalendarConnect?: boolean;
}

/**
 * コールバックURLからトークン (または PKCE の認可コード) を抽出する。
 * 実体は共有パッケージ (@ryuuhei0729/swimhub-oauth/mobile/pure) の実装で、
 * expo-web-browser / expo-auth-session のどちらにも依存しない純粋関数のため、
 * `google-auth.calendarConnectPending.test.ts` / `emailDeepLink.test.ts` など
 * expo をモックしていないテストからも安全に import できる。
 *
 * Supabase クライアントは flowType: "pkce" で構成されているため、
 * コールバックは通常クエリパラメータ `?code=...` で認可コードが返る。
 * 呼び出し側 (useGoogleAuth / AuthProvider / IdentityLinkSettings) は
 * code を優先して exchangeCodeForSession を試み、無ければ implicit の
 * フラグメント (#access_token=...) にフォールバックする。
 *
 * 共有パッケージの `includeProviderTokens` は既定 false (3アプリで汎用化した
 * 仕様) だが、このアプリでは Google カレンダー連携で `provider_refresh_token`
 * が必須のため、このラッパーでは既定 true に上書きする (移行前の挙動を維持)。
 * `includeProviderTokens` を使わない呼び出し元 (IdentityLinkSettings 等) は
 * 影響を受けない。呼び出し側で明示的に `{ includeProviderTokens: true }` を
 * 渡している箇所 (useGoogleAuth / AuthProvider) は、既定値と同じだが意図を
 * 明示するために残している。
 *
 * `error` フィールドは、Google/Supabase の生エラー文字列 (例: "access_denied")
 * か、機械可読コード `invalid_url` (URL パース失敗) のいずれか。どちらも
 * `localizeOAuthErrorCode` で処理すること (生の値をそのまま画面に出さないこと)。
 */
export type { ExtractedTokens, ExtractTokensOptions };
export const extractTokensFromUrl = (url: string, options?: ExtractTokensOptions): ExtractedTokens =>
  sharedExtractTokensFromUrl(url, { includeProviderTokens: true, ...options });

/**
 * 共有パッケージ (@ryuuhei0729/swimhub-oauth) の signInWithGoogle / claimOAuthCode が
 * Error.message に入れる機械可読コード (8種) と、上記 extractTokensFromUrl の
 * `invalid_url` コードを、移行前と同じ文言になるよう先に完全一致で解決する。
 * 一致しない場合 (Google/Supabase の生エラー文字列等) は既存のローカライザ
 * (localizeAuthError) にフォールバックする。
 *
 * 対応表 (移行前に同じ分岐が使っていた i18n キーに対応させている):
 * - invalid_url          … extractTokensFromUrl の URL パース失敗 (旧: catch 節で
 *                          直接 i18n.t("common.app.urlParseFailed") を返していた)
 * - auth_cancelled       … 旧: result.type === "cancel" の "auth.mobile.cancelled"
 * - auth_dismissed       … 旧: result.type === "dismiss" の "auth.mobile.dismissed"
 * - auth_failed          … 旧: 上記いずれでもない result.type の "auth.mobile.authFailed"
 * - url_not_received     … 旧: signInWithOAuth 成功時に data.url が無い場合の
 *                          "auth.mobile.oauthUrlGenerationFailed"
 * - tokens_not_received  … 旧: code も access/refresh token も無かった場合の
 *                          "auth.mobile.tokensNotReceived"
 * - session_not_received … exchangeCodeForSession/setSession がエラー無しで
 *                          session (access_token) を返さなかった場合。移行前の
 *                          同値分岐 ("auth.mobile.tokensNotReceived") を割り当てる
 * - code_exchange_failed … claimOAuthCode で負けた側が、勝った側の交換失敗を
 *                          検知した場合 (移行前は claimOAuthCode 自体が無く
 *                          該当分岐が無かった)。汎用の "auth.mobile.authFailed" を割り当てる
 */
const OAUTH_ERROR_CODE_TO_I18N_KEY: Readonly<Record<string, string>> = {
  invalid_url: "common.app.urlParseFailed",
  auth_cancelled: "auth.mobile.cancelled",
  auth_dismissed: "auth.mobile.dismissed",
  auth_failed: "auth.mobile.authFailed",
  code_exchange_failed: "auth.mobile.authFailed",
  session_not_received: "auth.mobile.tokensNotReceived",
  tokens_not_received: "auth.mobile.tokensNotReceived",
  url_not_received: "auth.mobile.oauthUrlGenerationFailed",
};

export const localizeOAuthErrorCode = (code: string): string => {
  const key = OAUTH_ERROR_CODE_TO_I18N_KEY[code];
  if (key) return i18n.t(key);
  return localizeAuthError(code);
};
