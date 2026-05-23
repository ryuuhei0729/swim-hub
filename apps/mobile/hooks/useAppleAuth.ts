/**
 * Apple認証フック
 * expo-apple-authenticationを使用してネイティブのApple認証を実行
 */
import { useState, useCallback } from "react";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
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

/**
 * Apple認証フック
 */
export const useAppleAuth = (): UseAppleAuthReturn => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // iOSでのみ利用可能
  const isAvailable = Platform.OS === "ios";

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
