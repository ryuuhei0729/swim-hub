/**
 * Google認証フック
 * expo-web-browserを使用してOAuthフローを実行
 */
import { useState, useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import { useTranslation } from "react-i18next";
import {
  getRedirectUri,
  extractTokensFromUrl,
  oauthSessionGuard,
  markCalendarConnectPending,
  clearCalendarConnectPending,
  type GoogleAuthOptions,
} from "@/lib/google-auth";
import { saveGoogleCalendarRefreshToken } from "@/lib/google-calendar-api";
import { supabase } from "@/lib/supabase";
import { localizeSupabaseAuthError, localizeAuthError } from "@/utils/authErrorLocalizer";

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
        const redirectUri = getRedirectUri({ forCalendarConnect });

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

        // カレンダー連携用ブラウザを開く直前に永続フラグを立てる。
        // Android の Custom Tabs は別プロセスで開くため、同意画面操作中にプロセスが
        // kill されても、コールドスタート復帰時に AuthProvider がこのフラグを見て
        // provider_refresh_token の保存を取りこぼさないようにする。
        if (forCalendarConnect) {
          await markCalendarConnectPending();
        }

        // openAuthSessionAsync 進行中は AuthProvider のグローバル Linking ハンドラを無効化する
        oauthSessionGuard.active = true;
        let result: Awaited<ReturnType<typeof WebBrowser.openAuthSessionAsync>>;
        try {
          result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
        } catch (browserErr) {
          // ブラウザ起動失敗時もガードを解除する
          oauthSessionGuard.active = false;
          throw browserErr;
        }

        if (result.type === "success" && result.url) {
          // コールバック URL からトークンを抽出
          const tokens = extractTokensFromUrl(result.url);

          if (tokens.error) {
            oauthSessionGuard.active = false;
            setError(tokens.error);
            return { success: false, error: new Error(tokens.error) };
          }

          // PKCE: クエリの認可コードを優先して exchangeCodeForSession で交換する。
          // ガードは、カレンダー連携の場合は provider_refresh_token 保存 API 呼び出しが
          // 完了するまで維持する（Android で openAuthSessionAsync の resolve と
          // Linking の 'url' イベントが二重発火した場合に、AuthProvider 側の
          // コールドスタート復旧パスと二重処理しないようにするため）。
          if (tokens.code) {
            let exchangeError: import("@supabase/supabase-js").AuthError | null = null;
            let accessToken: string | null = null;
            let providerRefreshToken: string | null = null;
            try {
              const { data, error } = await supabase.auth.exchangeCodeForSession(tokens.code);
              exchangeError = error;
              accessToken = data.session?.access_token ?? null;
              providerRefreshToken = data.session?.provider_refresh_token ?? null;
            } catch (exchangeErr) {
              oauthSessionGuard.active = false;
              throw exchangeErr;
            }

            // code_verifier が端末ストレージから読めなかった/既に消費済みの場合も
            // exchangeCodeForSession は例外を投げず AuthError を返すため、ここで捕捉できる。
            if (exchangeError || !accessToken) {
              oauthSessionGuard.active = false;
              const message = exchangeError
                ? localizeSupabaseAuthError(exchangeError)
                : t("auth.mobile.tokensNotReceived");
              setError(message);
              return { success: false, error: exchangeError ?? new Error(message) };
            }

            // カレンダー連携の場合、provider_refresh_tokenを保存してフラグを更新
            if (forCalendarConnect) {
              // provider_refresh_tokenがない場合でもエラーを表示（サイレントスキップ禁止）
              if (!providerRefreshToken) {
                oauthSessionGuard.active = false;
                setError(t("auth.mobile.googleCalendarPermissionDenied"));
                return { success: false, error: new Error("provider_refresh_token not received") };
              }

              const saveResult = await saveGoogleCalendarRefreshToken(
                accessToken,
                providerRefreshToken,
              );

              // 保存 API 呼び出し完了まで維持していたガードをここで解除する
              oauthSessionGuard.active = false;

              if (!saveResult.success) {
                const message = saveResult.error
                  ? localizeAuthError(saveResult.error)
                  : t("auth.mobile.calendarConnectionSaveFailed");
                setError(message);
                return { success: false, error: new Error(message) };
              }

              return { success: true };
            }

            oauthSessionGuard.active = false;
            return { success: true };
          }

          // implicit フォールバック (flowType が pkce でない/フラグメント形式で返ってきた場合)
          if (tokens.accessToken && tokens.refreshToken) {
            let sessionError: import("@supabase/supabase-js").AuthError | null = null;
            try {
              const { error } = await supabase.auth.setSession({
                access_token: tokens.accessToken,
                refresh_token: tokens.refreshToken,
              });
              sessionError = error;
            } catch (setSessionErr) {
              oauthSessionGuard.active = false;
              throw setSessionErr;
            }

            if (sessionError) {
              oauthSessionGuard.active = false;
              setError(localizeSupabaseAuthError(sessionError));
              return { success: false, error: sessionError };
            }

            // カレンダー連携の場合、provider_refresh_tokenを保存してフラグを更新
            if (forCalendarConnect) {
              // provider_refresh_tokenがない場合でもエラーを表示
              if (!tokens.providerRefreshToken) {
                oauthSessionGuard.active = false;
                setError(t("auth.mobile.googleCalendarPermissionDenied"));
                return { success: false, error: new Error("provider_refresh_token not received") };
              }

              const saveResult = await saveGoogleCalendarRefreshToken(
                tokens.accessToken,
                tokens.providerRefreshToken,
              );

              // 保存 API 呼び出し完了まで維持していたガードをここで解除する
              oauthSessionGuard.active = false;

              if (!saveResult.success) {
                const message = saveResult.error
                  ? localizeAuthError(saveResult.error)
                  : t("auth.mobile.calendarConnectionSaveFailed");
                setError(message);
                return { success: false, error: new Error(message) };
              }

              return { success: true };
            }

            oauthSessionGuard.active = false;
            return { success: true };
          }

          // code / access_token / refresh_token いずれも取れなかった場合
          oauthSessionGuard.active = false;
          const tokensMsg = t("auth.mobile.tokensNotReceived");
          setError(tokensMsg);
          return { success: false, error: new Error(tokensMsg) };
        }

        // cancel / dismiss / その他 — ガードを解除してから返す
        oauthSessionGuard.active = false;

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
        // 例外時もガードが残らないよう解除する
        oauthSessionGuard.active = false;
        const rawMessage = err instanceof Error ? err.message : t("auth.mobile.unknownError");
        const localizedMessage = localizeSupabaseAuthError({ message: rawMessage });
        setError(localizedMessage);
        return { success: false, error: err instanceof Error ? err : new Error(rawMessage) };
      } finally {
        setLoading(false);
        // warm path（このプロセス内で openAuthSessionAsync が resolve/例外まで完了した）
        // 場合は必ずここでフラグをクリアする。コールドスタート（OS による kill）で
        // このコードが実行されなかった場合のみ、AuthProvider 側がフラグを検知して処理を引き継ぐ。
        if (options?.forCalendarConnect) {
          await clearCalendarConnectPending();
        }
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
