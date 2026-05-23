/**
 * Google認証フック
 * expo-web-browserを使用してOAuthフローを実行
 */
import { useState, useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import { useTranslation } from "react-i18next";
import { getRedirectUri, extractTokensFromUrl, type GoogleAuthOptions } from "@/lib/google-auth";
import { supabase } from "@/lib/supabase";
import { localizeSupabaseAuthError } from "@/utils/authErrorLocalizer";

// WebBrowserの完了処理を登録
WebBrowser.maybeCompleteAuthSession();

export interface GoogleAuthResult {
  success: boolean;
  error?: Error | null;
}

export interface UseGoogleAuthReturn {
  /** Googleログインを実行 */
  signInWithGoogle: (options?: GoogleAuthOptions) => Promise<GoogleAuthResult>;
  /** Googleカレンダー連携を実行 */
  connectGoogleCalendar: () => Promise<GoogleAuthResult>;
  /** ローディング状態 */
  loading: boolean;
  /** エラーメッセージ */
  error: string | null;
  /** エラーをクリア */
  clearError: () => void;
}

/**
 * Google認証フック
 */
export const useGoogleAuth = (): UseGoogleAuthReturn => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Googleでサインイン
   */
  const signInWithGoogle = useCallback(
    async (options?: GoogleAuthOptions): Promise<GoogleAuthResult> => {
      if (!supabase) {
        const msg = t("auth.ui.clientNotInitialized");
        setError(msg);
        return { success: false, error: new Error(msg) };
      }

      setLoading(true);
      setError(null);

      try {
        const { scopes = [], forCalendarConnect = false } = options || {};
        const redirectUri = getRedirectUri();

        // スコープを構築
        const allScopes = ["openid", "email", "profile", ...scopes];
        if (forCalendarConnect) {
          allScopes.push("https://www.googleapis.com/auth/calendar.events");
        }

        // Supabaseの signInWithOAuth を使用（skipBrowserRedirect: true）
        const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: redirectUri,
            scopes: allScopes.join(" "),
            skipBrowserRedirect: true,
            queryParams: forCalendarConnect
              ? {
                  access_type: "offline",
                  prompt: "consent",
                }
              : undefined,
          },
        });

        if (oauthError || !data.url) {
          const errorMessage = oauthError
            ? localizeSupabaseAuthError(oauthError)
            : t("auth.mobile.oauthUrlGenerationFailed");
          setError(errorMessage);
          return {
            success: false,
            error: oauthError || new Error(t("auth.mobile.oauthUrlGenerationFailed")),
          };
        }

        // システムブラウザで認証画面を開く
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

        if (result.type === "success" && result.url) {
          // コールバックURLからトークンを抽出
          const tokens = extractTokensFromUrl(result.url);

          if (tokens.error) {
            setError(tokens.error);
            return { success: false, error: new Error(tokens.error) };
          }

          if (tokens.accessToken && tokens.refreshToken) {
            // Supabaseセッションを設定
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: tokens.accessToken,
              refresh_token: tokens.refreshToken,
            });

            if (sessionError) {
              setError(localizeSupabaseAuthError(sessionError));
              return { success: false, error: sessionError };
            }

            // カレンダー連携の場合、provider_refresh_tokenを保存してフラグを更新
            if (forCalendarConnect) {
              // provider_refresh_tokenがない場合でもエラーを表示
              if (!tokens.providerRefreshToken) {
                setError(t("auth.mobile.googleCalendarPermissionDenied"));
                return { success: false, error: new Error("provider_refresh_token not received") };
              }

              const webApiUrl = globalThis.__SWIM_HUB_WEB_API_URL__ || "https://swim-hub.app";
              const response = await fetch(`${webApiUrl}/api/google-calendar/connect`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${tokens.accessToken}`,
                },
                body: JSON.stringify({
                  providerRefreshToken: tokens.providerRefreshToken,
                }),
              });

              if (!response.ok) {
                const errorData = (await response.json().catch(() => ({}))) as { error?: string };
                const fallback = t("auth.mobile.calendarConnectionSaveFailed");
                setError(errorData.error || fallback);
                return {
                  success: false,
                  error: new Error(errorData.error || fallback),
                };
              }
            }

            return { success: true };
          }

          const tokensMsg = t("auth.mobile.tokensNotReceived");
          setError(tokensMsg);
          return { success: false, error: new Error(tokensMsg) };
        }

        if (result.type === "cancel") {
          const msg = t("auth.mobile.cancelled");
          setError(msg);
          return { success: false, error: new Error(msg) };
        }

        if (result.type === "dismiss") {
          const msg = t("auth.mobile.dismissed");
          setError(msg);
          return { success: false, error: new Error(msg) };
        }

        const failedMsg = t("auth.mobile.authFailed");
        setError(failedMsg);
        return { success: false, error: new Error(failedMsg) };
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : t("auth.mobile.unknownError");
        const localizedMessage = localizeSupabaseAuthError({ message: rawMessage });
        setError(localizedMessage);
        return { success: false, error: err instanceof Error ? err : new Error(rawMessage) };
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  /**
   * Googleカレンダー連携
   * カレンダー権限を持つスコープで認証を実行
   */
  const connectGoogleCalendar = useCallback(async (): Promise<GoogleAuthResult> => {
    return signInWithGoogle({ forCalendarConnect: true });
  }, [signInWithGoogle]);

  /**
   * エラーをクリア
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    signInWithGoogle,
    connectGoogleCalendar,
    loading,
    error,
    clearError,
  };
};
