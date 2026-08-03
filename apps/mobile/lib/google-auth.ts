/**
 * Google OAuth認証ユーティリティ
 * Expo + Supabase でのGoogle認証フローを管理
 */
import { makeRedirectUri } from "expo-auth-session";
import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "@/i18n";

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
 *
 * Supabase クライアントは flowType: "pkce" で構成されているため、
 * コールバックは通常クエリパラメータ `?code=...` で認可コードが返る。
 * 呼び出し側 (useGoogleAuth / AuthProvider / IdentityLinkSettings) は
 * code を優先して exchangeCodeForSession を試み、無ければ implicit の
 * フラグメント (#access_token=...) にフォールバックする。
 *
 * provider_token / provider_refresh_token (Google 側のトークン) は、
 * PKCE 経路では exchangeCodeForSession の結果セッションに含まれる想定であり、
 * この URL 直読みの経路には現れない。implicit フォールバック時のみ
 * フラグメントから読み取る。
 */
export interface ExtractedTokens {
  accessToken: string | null;
  refreshToken: string | null;
  expiresIn: number | null;
  tokenType: string | null;
  /** PKCE フロー時にクエリパラメータで返る認可コード */
  code: string | null;
  /** Googleのアクセストークン（implicit フォールバック時のみ。Google API呼び出し用） */
  providerToken: string | null;
  /** Googleのリフレッシュトークン（implicit フォールバック時のみ。カレンダー連携用に保存が必要） */
  providerRefreshToken: string | null;
  error: string | null;
}

export const extractTokensFromUrl = (url: string): ExtractedTokens => {
  try {
    const urlObj = new URL(url);

    // フラグメント(#)とクエリパラメータの両方を確認する
    const hashParams = new URLSearchParams(urlObj.hash.substring(1));
    const queryParams = urlObj.searchParams;

    // OAuth プロバイダ / Supabase 側のエラーは PKCE (query) と implicit (hash) の
    // どちらの形式で返ってくる可能性もあるため両方確認する
    const error =
      hashParams.get("error_description") ||
      hashParams.get("error") ||
      queryParams.get("error_description") ||
      queryParams.get("error");
    if (error) {
      return {
        accessToken: null,
        refreshToken: null,
        expiresIn: null,
        tokenType: null,
        code: null,
        providerToken: null,
        providerRefreshToken: null,
        error,
      };
    }

    // トークンを抽出 (implicit フォールバック用)
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const expiresIn = hashParams.get("expires_in");
    const tokenType = hashParams.get("token_type");
    // Googleのトークン（カレンダー連携用。implicit フォールバック時のみここに現れる）
    const providerToken = hashParams.get("provider_token");
    const providerRefreshToken = hashParams.get("provider_refresh_token");

    return {
      accessToken,
      refreshToken,
      expiresIn: expiresIn ? parseInt(expiresIn, 10) : null,
      tokenType,
      code: queryParams.get("code"),
      providerToken,
      providerRefreshToken,
      error: null,
    };
  } catch {
    return {
      accessToken: null,
      refreshToken: null,
      expiresIn: null,
      tokenType: null,
      code: null,
      providerToken: null,
      providerRefreshToken: null,
      error: i18n.t("common.app.urlParseFailed"),
    };
  }
};
