/**
 * Apple認証フック
 * - iOS: expo-apple-authentication を使用してネイティブの Apple 認証を実行
 * - Android: ネイティブの Sign in with Apple が無いため、Supabase の OAuth
 *   (Web ベースの Sign in with Apple) を expo-web-browser で開いて認証する。
 *   流れは Google ログイン (共有パッケージの signInWithGoogle) と同じで、
 *   swimhub://auth/callback?code=... を受け取って PKCE の code を交換する。
 */
import { useState, useCallback } from "react";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { claimOAuthCode } from "@ryuuhei0729/swimhub-oauth/mobile";
import {
  getRedirectUri,
  extractTokensFromUrl,
  oauthSessionGuard,
  localizeOAuthErrorCode,
} from "@/lib/google-auth";
import { supabase } from "@/lib/supabase";
import { saveLastLoginMethod } from "@/lib/lastLoginMethod";
import { localizeSupabaseAuthError } from "@/utils/authErrorLocalizer";

export interface AppleAuthResult {
  success: boolean;
  error?: Error | null;
}

/**
 * expo-apple-authenticationのエラーコード
 */
type AppleAuthErrorCode =
  | "ERR_REQUEST_CANCELED"
  | "ERR_REQUEST_FAILED"
  | "ERR_REQUEST_INVALID"
  | "ERR_REQUEST_NOT_HANDLED"
  | "ERR_REQUEST_UNKNOWN";

/**
 * Apple認証エラー型
 */
type AppleAuthError = Error & { code?: AppleAuthErrorCode };

export interface UseAppleAuthReturn {
  /** Appleログインを実行 */
  signInWithApple: () => Promise<AppleAuthResult>;
  /** ローディング状態 */
  loading: boolean;
  /** エラーメッセージ */
  error: string | null;
  /** エラーをクリア */
  clearError: () => void;
  /** Apple認証が利用可能かどうか */
  isAvailable: boolean;
}

type SupabaseClient = NonNullable<typeof supabase>;

/**
 * Android 向け: Supabase の OAuth (Web ベースの Sign in with Apple) をブラウザで開いてサインインする。
 * 決して reject せず、失敗は localizeOAuthErrorCode で扱える機械可読コード
 * (auth_cancelled など) か Supabase のエラーを Error.message に入れて返す。
 */
const signInWithAppleInBrowser = async (
  client: SupabaseClient,
): Promise<{ success: boolean; error?: Error }> => {
  const redirectUri = getRedirectUri();
  try {
    const { data, error: oauthError } = await client.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo: redirectUri,
        scopes: "name email",
        skipBrowserRedirect: true,
      },
    });
    if (oauthError || !data.url) {
      return { success: false, error: oauthError ?? new Error("url_not_received") };
    }

    // openAuthSessionAsync 進行中は AuthProvider のグローバル Linking ハンドラを無効化する
    oauthSessionGuard.active = true;
    const browserResult = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

    if (browserResult.type !== "success" || !browserResult.url) {
      const code =
        browserResult.type === "cancel"
          ? "auth_cancelled"
          : browserResult.type === "dismiss"
            ? "auth_dismissed"
            : "auth_failed";
      return { success: false, error: new Error(code) };
    }

    const tokens = extractTokensFromUrl(browserResult.url);
    if (tokens.error) {
      return { success: false, error: new Error(tokens.error) };
    }

    if (tokens.code) {
      // 同一 code を AuthProvider のグローバル Linking ハンドラ安全網と二重に交換しない
      const claim = claimOAuthCode(tokens.code);
      if (!claim.claimed) {
        const otherResult = await claim.result;
        return otherResult.success
          ? { success: true }
          : { success: false, error: new Error("code_exchange_failed") };
      }
      try {
        const { data: exchangeData, error: exchangeError } =
          await client.auth.exchangeCodeForSession(tokens.code);
        const ok = !exchangeError && !!exchangeData.session;
        claim.resolve({ success: ok });
        if (!ok) {
          return { success: false, error: exchangeError ?? new Error("session_not_received") };
        }
        return { success: true };
      } catch (exchangeException) {
        claim.resolve({ success: false });
        throw exchangeException;
      }
    }

    // implicit フォールバック (#access_token=...)
    if (tokens.accessToken && tokens.refreshToken) {
      const { data: sessionData, error: sessionError } = await client.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
      if (sessionError || !sessionData.session) {
        return { success: false, error: sessionError ?? new Error("session_not_received") };
      }
      return { success: true };
    }

    return { success: false, error: new Error("tokens_not_received") };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e : new Error(String(e)) };
  } finally {
    oauthSessionGuard.active = false;
  }
};

/**
 * Apple認証フック
 */
export const useAppleAuth = (): UseAppleAuthReturn => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // iOS はネイティブ、Android はブラウザ (Supabase の OAuth) で利用可能
  const isAvailable = Platform.OS === "ios" || Platform.OS === "android";

  /**
   * Appleでサインイン
   */
  const signInWithApple = useCallback(async (): Promise<AppleAuthResult> => {
    if (!isAvailable) {
      const msg = t("auth.mobile.appleAuthIosOnly");
      setError(msg);
      return { success: false, error: new Error(msg) };
    }

    if (!supabase) {
      const msg = t("auth.ui.clientNotInitialized");
      setError(msg);
      return { success: false, error: new Error(msg) };
    }

    setLoading(true);
    setError(null);

    if (Platform.OS === "android") {
      try {
        const result = await signInWithAppleInBrowser(supabase);
        if (!result.success) {
          const message = localizeOAuthErrorCode(result.error?.message ?? "");
          setError(message);
          return { success: false, error: new Error(message) };
        }
        await saveLastLoginMethod("apple");
        return { success: true };
      } finally {
        setLoading(false);
      }
    }

    // タイムアウト保護: signInAsyncがiPad等でハングした場合にローディングを強制解除
    const APPLE_AUTH_TIMEOUT_MS = 60000;
    const timeoutId = setTimeout(() => {
      setLoading(false);
      setError(t("auth.mobile.appleAuthTimeout"));
    }, APPLE_AUTH_TIMEOUT_MS);

    try {
      // Apple認証が利用可能かチェック
      const isAppleAuthAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAppleAuthAvailable) {
        const msg = t("auth.mobile.appleAuthDeviceUnavailable");
        setError(msg);
        return { success: false, error: new Error(msg) };
      }

      // nonce生成（リプレイ攻撃防止・Supabaseトークン検証に必要）
      const rawNonce = Crypto.getRandomValues(new Uint8Array(32)).reduce(
        (acc, val) => acc + val.toString(16).padStart(2, "0"),
        "",
      );
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      // ネイティブのApple認証UIを表示
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      // identityTokenが必要
      if (!credential.identityToken) {
        const msg = t("auth.mobile.appleTokenNotReceived");
        setError(msg);
        return { success: false, error: new Error(msg) };
      }

      // ユーザー名を取得（初回のみ取得可能）
      const fullName = credential.fullName;
      const displayName = fullName
        ? [fullName.familyName, fullName.givenName].filter(Boolean).join(" ")
        : undefined;

      // Supabaseに認証トークンを渡してサインイン（rawNonceで検証）
      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
        nonce: rawNonce,
      });

      if (signInError) {
        setError(localizeSupabaseAuthError(signInError));
        return { success: false, error: signInError };
      }

      // ログインはここで成立している（後続の名前更新の成否に左右されないよう先に記録する）
      await saveLastLoginMethod("apple");

      // ユーザー名が取得できた場合はメタデータを更新
      if (displayName) {
        await supabase.auth.updateUser({
          data: { name: displayName },
        });
      }

      return { success: true };
    } catch (e) {
      const err = e as AppleAuthError;

      // ユーザーがキャンセルした場合
      // ERR_REQUEST_CANCELED: 明示的なキャンセル
      // ERR_REQUEST_UNKNOWN + "authorization attempt failed": ダイアログを閉じた場合
      if (
        err.code === "ERR_REQUEST_CANCELED" ||
        (err.code === "ERR_REQUEST_UNKNOWN" &&
          err.message?.toLowerCase().includes("authorization attempt failed"))
      ) {
        const msg = t("auth.mobile.cancelled");
        setError(msg);
        return { success: false, error: new Error(msg) };
      }

      const rawMessage = err.message || t("auth.mobile.unknownError");
      const localizedMessage = localizeSupabaseAuthError({ message: rawMessage });
      setError(localizedMessage);
      return { success: false, error: err };
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [isAvailable, t]);

  /**
   * エラーをクリア
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    signInWithApple,
    loading,
    error,
    clearError,
    isAvailable,
  };
};
