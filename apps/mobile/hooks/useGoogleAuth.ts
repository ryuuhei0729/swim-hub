/**
 * Google認証フック
 * expo-web-browserを使用してOAuthフローを実行
 */
import { useState, useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import { useTranslation } from "react-i18next";
import {
  claimOAuthCode,
  signInWithGoogle as sharedSignInWithGoogle,
} from "@ryuuhei0729/swimhub-oauth/mobile";
import {
  getRedirectUri,
  extractTokensFromUrl,
  oauthSessionGuard,
  markCalendarConnectPending,
  clearCalendarConnectPending,
  localizeOAuthErrorCode,
  APP_SCHEME,
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

      const { scopes = [], forCalendarConnect = false } = options || {};

      try {
        if (!forCalendarConnect) {
          // 通常ログイン: PKCE の交換・claimOAuthCode による二重処理ガード・
          // implicit フォールバックは共有パッケージ (signInWithGoogle) の責務。
          // oauthSessionGuard は AuthProvider のグローバル Linking ハンドラの
          // 早期リターン判定 (このアプリ固有のセーフティネット) のために
          // 呼び出し前後で維持する。
          oauthSessionGuard.active = true;
          let result: Awaited<ReturnType<typeof sharedSignInWithGoogle>>;
          try {
            result = await sharedSignInWithGoogle({
              supabase,
              scheme: APP_SCHEME,
              additionalScopes: scopes,
            });
          } finally {
            oauthSessionGuard.active = false;
          }

          if (!result.success) {
            const message = localizeOAuthErrorCode(result.error?.message ?? "");
            setError(message);
            return { success: false, error: result.error ?? new Error(message) };
          }

          return { success: true };
        }

        // --- Googleカレンダー連携 ---
        // 共有パッケージの signInWithGoogle は redirectUri を差し替えられないため
        // (常に getRedirectUri(scheme) 固定)、このフローだけは従来通り自前で行う。
        // `flow=calendar-connect` クエリ付きのリダイレクト URI は、コールドスタート
        // (Android で Custom Tabs 操作中にプロセスが kill された場合) の復旧判定に
        // AuthProvider が必須で使っているため、これを維持する。
        const redirectUri = getRedirectUri({ forCalendarConnect: true });
        const allScopes = [
          "openid",
          "email",
          "profile",
          ...scopes,
          "https://www.googleapis.com/auth/calendar.events",
        ];

        const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: redirectUri,
            scopes: allScopes.join(" "),
            skipBrowserRedirect: true,
            queryParams: {
              access_type: "offline",
              prompt: "consent",
            },
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
        // Android の Custom Tabs は別プロセスで開くため、同意画面操作中に プロセスが
        // kill されても、コールドスタート復帰時に AuthProvider がこのフラグを見て
        // provider_refresh_token の保存を取りこぼさないようにする。
        await markCalendarConnectPending();

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
          const tokens = extractTokensFromUrl(result.url, { includeProviderTokens: true });

          if (tokens.error) {
            oauthSessionGuard.active = false;
            const message = localizeOAuthErrorCode(tokens.error);
            setError(message);
            return { success: false, error: new Error(message) };
          }

          // PKCE: クエリの認可コードを優先して exchangeCodeForSession で交換する。
          // ガードは、カレンダー連携の場合は provider_refresh_token 保存 API 呼び出しが
          // 完了するまで維持する（Android で openAuthSessionAsync の resolve と
          // Linking の 'url' イベントが二重発火した場合に、AuthProvider 側の
          // コールドスタート復旧パスと二重処理しないようにするため）。
          // 同一 code の二重交換自体は claimOAuthCode (共有パッケージ) が防ぐ。
          if (tokens.code) {
            const claim = claimOAuthCode(tokens.code);

            if (!claim.claimed) {
              // 他所 (AuthProvider のグローバル Linking ハンドラ安全網) が既にこの
              // code を claim 済み。無条件で成功扱いにはせず、実際の交換結果を
              // 待って同期する。
              oauthSessionGuard.active = false;
              const otherResult = await claim.result;
              if (!otherResult.success) {
                const message = localizeOAuthErrorCode("code_exchange_failed");
                setError(message);
                return { success: false, error: new Error(message) };
              }
              return { success: true };
            }

            let exchangeError: import("@supabase/supabase-js").AuthError | null = null;
            let accessToken: string | null = null;
            let providerRefreshToken: string | null = null;
            try {
              const { data, error } = await supabase.auth.exchangeCodeForSession(tokens.code);
              exchangeError = error;
              accessToken = data.session?.access_token ?? null;
              providerRefreshToken = data.session?.provider_refresh_token ?? null;
            } catch (exchangeErr) {
              claim.resolve({ success: false });
              oauthSessionGuard.active = false;
              throw exchangeErr;
            }

            // code_verifier が端末ストレージから読めなかった/既に消費済みの場合も
            // exchangeCodeForSession は例外を投げず AuthError を返すため、ここで捕捉できる。
            if (exchangeError || !accessToken) {
              claim.resolve({ success: false });
              oauthSessionGuard.active = false;
              const message = exchangeError
                ? localizeSupabaseAuthError(exchangeError)
                : t("auth.mobile.tokensNotReceived");
              setError(message);
              return { success: false, error: exchangeError ?? new Error(message) };
            }

            claim.resolve({ success: true });

            // カレンダー連携の場合、provider_refresh_tokenを保存してフラグを更新
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
        // rawMessage は localizeSupabaseAuthError の既知パターン照合専用の入力であり、
        // 同関数が本番ビルドでは未知のメッセージを汎用文言にフォールバックするため、
        // ここでの instanceof Error は情報露出には当たらない (utils/authErrorLocalizer.ts 参照)。
        const rawMessage = err instanceof Error ? err.message : t("auth.mobile.unknownError");
        const localizedMessage = localizeSupabaseAuthError({ message: rawMessage });
        setError(localizedMessage);
        // 呼び出し元 (GoogleCalendarSyncSettings 等) が result.error.message をそのまま表示するため、
        // 生の err をここで返すと localizeSupabaseAuthError を経由しない生メッセージが露出する。
        // 常に上で算出済みの安全な localizedMessage を積んだ Error を返す
        return { success: false, error: new Error(localizedMessage) };
      } finally {
        setLoading(false);
        // warm path（このプロセス内で openAuthSessionAsync が resolve/例外まで完了した）
        // 場合は必ずここでフラグをクリアする。コールドスタート（OS による kill）で
        // このコードが実行されなかった場合のみ、AuthProvider 側がフラグを検知して処理を引き継ぐ。
        if (forCalendarConnect) {
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
