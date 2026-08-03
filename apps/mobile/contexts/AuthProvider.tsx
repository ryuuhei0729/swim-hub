import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Alert, Linking } from "react-native";
import { supabase } from "@/lib/supabase";
import {
  initRevenueCat,
  loginRevenueCat,
  logoutRevenueCat,
  addCustomerInfoListener,
} from "@/lib/revenucat";
import type { Database } from "@swim-hub/shared/types";
import type { AuthState, AuthContextType, SubscriptionInfo } from "@swim-hub/shared/types/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getQueryClient } from "@/providers/QueryProvider";
import i18n from "@/i18n";
import {
  getRedirectUri,
  extractTokensFromUrl,
  oauthSessionGuard,
  consumeCalendarConnectPending,
} from "@/lib/google-auth";
import { saveGoogleCalendarRefreshToken } from "@/lib/google-calendar-api";
import {
  isEmailAuthCallback,
  hasCalendarConnectFlowFlag,
  extractTokenHashFromUrl,
} from "@/lib/auth-deep-link";
import { localizeAuthError } from "@/utils/authErrorLocalizer";

/**
 * Mobile 固有の AuthState 拡張
 * onboardingCompleted: null = 取得中, false = 未完了, true = 完了
 *
 * TODO: apps/shared/types/auth.ts の AuthState に onboardingCompleted が追加されたら
 *       このローカル拡張を削除し、共通型を参照するように変更すること。
 */
type MobileAuthState = AuthState & {
  onboardingCompleted: boolean | null;
};

type MobileAuthContextType = AuthContextType & {
  onboardingCompleted: boolean | null;
  updateOnboardingCompleted: (value: boolean) => Promise<{ error: Error | null }>;
  getAccessToken: () => Promise<string | null>;
};

const AuthContext = createContext<MobileAuthContextType | undefined>(undefined);

/**
 * コールドスタート復帰時（Android で Custom Tabs 操作中にアプリプロセスが kill され、
 * ディープリンクがコールドスタートとして届いたケース）に、
 * Googleカレンダー連携の provider_refresh_token 保存を取りこぼさず完了させる。
 * useGoogleAuth の warm path と同じ API 呼び出し (saveGoogleCalendarRefreshToken) を使い、
 * 成否を Alert でユーザーに明示する（サイレント失敗を防ぐ）。
 */
const completeCalendarConnectRecovery = async (
  accessToken: string,
  providerRefreshToken: string | null,
): Promise<void> => {
  if (!providerRefreshToken) {
    // Supabase の設定や flow type によっては provider_refresh_token が
    // 付与されないことがあるため、サイレントに握りつぶさず再試行を促す
    Alert.alert(
      i18n.t("common.alertErrorTitle"),
      i18n.t("auth.mobile.googleCalendarPermissionDenied"),
    );
    return;
  }

  const saveResult = await saveGoogleCalendarRefreshToken(accessToken, providerRefreshToken);

  if (!saveResult.success) {
    const message = saveResult.error
      ? localizeAuthError(saveResult.error)
      : i18n.t("auth.mobile.calendarConnectionSaveFailed");
    Alert.alert(
      i18n.t("common.alertErrorTitle"),
      message,
    );
    return;
  }

  Alert.alert(i18n.t("common.notice"), i18n.t("auth.mobile.calendarConnectionSuccess"));
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<MobileAuthState>({
    user: null,
    session: null,
    loading: true,
    subscription: null,
    onboardingCompleted: null,
  });

  // サブスクリプション情報を Supabase から直接取得（Web と同じパターン）
  // API 経由だと Bearer token の有効期限切れで 401 になる問題があったため、
  // Supabase クライアントを直接使う（token refresh が内蔵されている）
  const fetchSubscription = useCallback(
    async (userId: string): Promise<SubscriptionInfo | null> => {
      if (!supabase) return null;
      try {
        const { data, error } = (await supabase
          .from("user_subscriptions")
          .select("plan, status, cancel_at_period_end, premium_expires_at, trial_end")
          .eq("id", userId)
          .single()) as {
          data: {
            plan: string;
            status: string | null;
            cancel_at_period_end: boolean | null;
            premium_expires_at: string | null;
            trial_end: string | null;
          } | null;
          error: unknown;
        };
        if (error || !data) return null;
        return {
          plan: data.plan as "free" | "premium",
          status: data.status as SubscriptionInfo["status"],
          cancelAtPeriodEnd: data.cancel_at_period_end ?? false,
          premiumExpiresAt: data.premium_expires_at ?? null,
          trialEnd: data.trial_end ?? null,
        };
      } catch {
        return null;
      }
    },
    [],
  );

  // オンボーディング完了状態を users テーブルから取得
  const fetchOnboardingCompleted = useCallback(async (userId: string): Promise<boolean | null> => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from("users")
        .select("onboarding_completed")
        .eq("id", userId)
        .single();
      if (error || !data) return null;
      return (data as { onboarding_completed: boolean }).onboarding_completed;
    } catch {
      return null;
    }
  }, []);

  // オンボーディング完了状態を DB に保存し、ローカル state を更新
  const updateOnboardingCompleted = useCallback(
    async (value: boolean): Promise<{ error: Error | null }> => {
      if (!supabase) {
        return { error: new Error(i18n.t("common.app.supabaseClientNotInitialized")) };
      }
      if (!authState.user) {
        return { error: new Error("User not authenticated") };
      }
      try {
        const { error } = await supabase
          .from("users")
          .update({ onboarding_completed: value })
          .eq("id", authState.user.id);
        if (error) {
          return { error: new Error(error.message) };
        }
        setAuthState((prev) => ({ ...prev, onboardingCompleted: value }));
        return { error: null };
      } catch (err) {
        console.error("updateOnboardingCompleted error:", err);
        return { error: err instanceof Error ? err : new Error("Unknown error") };
      }
    },
    [authState.user],
  );

  // 最新の access_token を取得（有効期限切れ・期限切れ間近の場合はリフレッシュを試みる）
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!supabase) return null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        // セッション自体がない、または access_token がない場合はリフレッシュを試みる
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        return refreshed?.access_token ?? null;
      }
      // expires_at が設定されている場合のみ有効期限チェックを行う
      if (session.expires_at !== undefined) {
        const now = Math.floor(Date.now() / 1000);
        const isExpiredOrExpiringSoon = session.expires_at - now < 60;
        if (isExpiredOrExpiringSoon) {
          const { data: { session: refreshed } } = await supabase.auth.refreshSession();
          return refreshed?.access_token ?? null;
        }
      }
      return session.access_token;
    } catch {
      return null;
    }
  }, []);

  // サブスクリプション情報を再取得（外部から呼び出し可能）
  const refreshSubscription = useCallback(async () => {
    if (!authState.user?.id) return;
    const sub = await fetchSubscription(authState.user.id);
    if (sub !== null) {
      setAuthState((prev) => ({ ...prev, subscription: sub }));
    }
  }, [authState.user, fetchSubscription]);

  // ログイン
  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return {
        data: null,
        error: new Error(
          i18n.t("common.app.supabaseClientNotInitialized"),
        ) as import("@supabase/supabase-js").AuthError,
      };
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { data: null, error: error as import("@supabase/supabase-js").AuthError };
      }

      return { data: data ? { user: data.user, session: data.session } : null, error: null };
    } catch (error) {
      console.error("Sign in error:", error);
      return { data: null, error: error as import("@supabase/supabase-js").AuthError };
    }
  }, []);

  // サインアップ
  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    if (!supabase) {
      return {
        data: null,
        error: new Error(
          i18n.t("common.app.supabaseClientNotInitialized"),
        ) as import("@supabase/supabase-js").AuthError,
      };
    }
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name || "",
          },
          emailRedirectTo: getRedirectUri(),
        },
      });

      if (error) {
        return { data: null, error: error as import("@supabase/supabase-js").AuthError };
      }

      // Supabase は Confirm Email 有効時、登録済みメールでも error を返さず
      // identities が空配列の user を返す（メール列挙攻撃対策のデフォルト挙動）。
      // 確認メールも実際には送信されないため、ユーザーに明示的に伝える。
      if (data?.user && (data.user.identities?.length ?? 0) === 0) {
        const alreadyRegisteredError = Object.assign(
          new Error(i18n.t("common.app.emailAlreadyRegistered")),
          { status: 422, code: "user_already_exists" },
        ) as import("@supabase/supabase-js").AuthError;
        return { data: null, error: alreadyRegisteredError };
      }

      return { data: data ? { user: data.user, session: data.session } : null, error: null };
    } catch (error) {
      console.error("Sign up error:", error);
      return { data: null, error: error as import("@supabase/supabase-js").AuthError };
    }
  }, []);

  // OAuthログイン（Google / Apple）
  const signInWithOAuth = useCallback(
    async (
      provider: "google" | "apple",
      options?: { redirectTo?: string; scopes?: string; queryParams?: Record<string, string> },
    ) => {
      if (!supabase) {
        return {
          error: new Error(
            i18n.t("common.app.supabaseClientNotInitialized"),
          ) as import("@supabase/supabase-js").AuthError,
        };
      }
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: options?.redirectTo,
            scopes: options?.scopes,
            queryParams: options?.queryParams || {
              access_type: "offline",
              prompt: "consent",
            },
          },
        });

        if (error) {
          return { error: error as import("@supabase/supabase-js").AuthError };
        }

        return { error: null };
      } catch (error) {
        console.error("OAuth sign in error:", error);
        return { error: error as import("@supabase/supabase-js").AuthError };
      }
    },
    [],
  );

  // ログアウト
  const signOut = useCallback(async () => {
    if (!supabase) {
      return {
        error: new Error(
          i18n.t("common.app.supabaseClientNotInitialized"),
        ) as import("@supabase/supabase-js").AuthError,
      };
    }
    try {
      await logoutRevenueCat();

      const { error } = await supabase.auth.signOut();
      if (error) {
        await supabase.auth.signOut({ scope: "local" });
      }
    } catch {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch (localError) {
        console.error("Sign out error:", localError);
        return { error: localError as import("@supabase/supabase-js").AuthError };
      }
    } finally {
      setAuthState((prev) => ({ ...prev, subscription: null }));

      const queryClient = getQueryClient();
      queryClient.clear();

      try {
        const [
          { usePracticeFormStore },
          { usePracticeFilterStore },
          { usePracticeTimeStore },
          { useCompetitionFormStore },
          { useRecordStore },
        ] = await Promise.all([
          import("@/stores/practiceFormStore"),
          import("@/stores/practiceFilterStore"),
          import("@/stores/practiceTimeStore"),
          import("@/stores/competitionFormStore"),
          import("@/stores/recordStore"),
        ]);

        usePracticeFormStore.getState().reset();
        usePracticeFilterStore.getState().reset();
        usePracticeTimeStore.getState().reset();
        useCompetitionFormStore.getState().reset();
        useRecordStore.getState().reset();
      } catch {
        // ストアがまだ読み込まれていない場合は無視
      }
    }
    return { error: null };
  }, []);

  // パスワードリセット
  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) {
      return {
        data: null,
        error: new Error(
          i18n.t("common.app.supabaseClientNotInitialized"),
        ) as import("@supabase/supabase-js").AuthError,
      };
    }
    try {
      // パスワードリセットの redirectTo (recovery ディープリンク対応) は別スプリントで実装する
      const { error } = await supabase.auth.resetPasswordForEmail(email, {});

      if (error) {
        return { data: null, error: error as import("@supabase/supabase-js").AuthError };
      }

      return { data: null, error: null };
    } catch (error) {
      console.error("Password reset error:", error);
      return { data: null, error: error as import("@supabase/supabase-js").AuthError };
    }
  }, []);

  // パスワード更新
  const updatePassword = useCallback(async (newPassword: string) => {
    if (!supabase) {
      return {
        data: null,
        error: new Error(
          i18n.t("common.app.supabaseClientNotInitialized"),
        ) as import("@supabase/supabase-js").AuthError,
      };
    }
    try {
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        return { data: null, error: error as import("@supabase/supabase-js").AuthError };
      }

      return { data: data ? { user: data.user } : null, error: null };
    } catch (error) {
      console.error("Password update error:", error);
      return { data: null, error: error as import("@supabase/supabase-js").AuthError };
    }
  }, []);

  // プロフィール更新
  const updateProfile = useCallback(
    async (updates: Partial<import("@swim-hub/shared/types").UserProfile>) => {
      if (!supabase) {
        return {
          error: new Error(
            i18n.t("common.app.supabaseClientNotInitialized"),
          ) as import("@supabase/supabase-js").AuthError,
        };
      }
      try {
        if (!authState.user) {
          return {
            error: new Error(
              "User not authenticated",
            ) as unknown as import("@supabase/supabase-js").AuthError,
          };
        }

        const { error } = await supabase.from("users").update(updates).eq("id", authState.user.id);

        if (error) {
          return { error: error as unknown as import("@supabase/supabase-js").AuthError };
        }

        return { error: null };
      } catch (error) {
        console.error("Profile update error:", error);
        return { error: error as unknown as import("@supabase/supabase-js").AuthError };
      }
    },
    [authState.user],
  );

  // RevenueCat 初期化
  useEffect(() => {
    initRevenueCat();
  }, []);

  // RevenueCat 顧客情報変更リスナー（購入・更新時にサブスクリプション情報を再取得）
  useEffect(() => {
    if (!authState.user) return;

    const removeListener = addCustomerInfoListener(async () => {
      if (authState.user) {
        const sub = await fetchSubscription(authState.user.id);
        if (sub !== null) {
          setAuthState((prev) => ({ ...prev, subscription: sub }));
        }
      }
    });

    return removeListener;
  }, [authState.user, fetchSubscription]);

  // user が変わったらサブスクリプション + オンボーディング状態を取得 & RevenueCat にログイン
  useEffect(() => {
    if (authState.user) {
      loginRevenueCat(authState.user.id);
      fetchSubscription(authState.user.id).then((sub) => {
        if (sub !== null) {
          setAuthState((prev) => ({ ...prev, subscription: sub }));
        }
      });
      fetchOnboardingCompleted(authState.user.id).then((completed) => {
        // null は取得失敗 — デフォルト false (未完了) として扱い、オンボーディングを再表示
        setAuthState((prev) => ({ ...prev, onboardingCompleted: completed ?? false }));
      });
    } else {
      setAuthState((prev) => ({ ...prev, subscription: null, onboardingCompleted: null }));
    }
  }, [authState.user, fetchSubscription, fetchOnboardingCompleted]);

  useEffect(() => {
    let isMounted = true;

    // Supabaseクライアントが初期化されていない場合の処理
    if (!supabase) {
      console.error(i18n.t("common.app.supabaseClientNotInitialized"));
      setAuthState({
        user: null,
        session: null,
        loading: false,
        subscription: null,
        onboardingCompleted: null,
      });
      return;
    }

    let initialSessionReceived = false;

    const forceResolve = () => {
      if (isMounted && !initialSessionReceived) {
        initialSessionReceived = true;
        console.error("認証初期化タイムアウト — loading を強制解除");
        setAuthState((prev) => (prev.loading ? { ...prev, loading: false } : prev));
      }
    };

    // 最終安全弁: 10秒後には必ず loading を解除する
    const hardTimeoutId = setTimeout(forceResolve, 10000);

    // 5秒以内に INITIAL_SESSION が来なければ getSession() でフォールバック
    const timeoutId = setTimeout(async () => {
      if (!isMounted || initialSessionReceived) return;
      console.warn("INITIAL_SESSION タイムアウト — getSession() でフォールバック");
      try {
        const { data: { session } } = await supabase!.auth.getSession();
        if (isMounted && !initialSessionReceived) {
          initialSessionReceived = true;
          clearTimeout(hardTimeoutId);
          setAuthState((prev) => ({
            ...prev,
            user: session?.user ?? null,
            session,
            loading: false,
          }));
        }
      } catch (err) {
        console.error("getSession フォールバック失敗:", err);
        forceResolve();
      }
    }, 5000);

    // 認証状態の変更を監視 — セッション情報のみ反映し、サブスクリプション取得は useEffect に委譲
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      initialSessionReceived = true;
      clearTimeout(timeoutId);
      clearTimeout(hardTimeoutId);

      setAuthState((prev) => ({
        ...prev,
        user: session?.user ?? null,
        session,
        loading: false,
        subscription: session?.user ? prev.subscription : null,
      }));

      // ログアウト時は全てのキャッシュをクリア（セキュリティとデータ整合性のため）
      if (event === "SIGNED_OUT") {
        logoutRevenueCat().catch((err) => {
          console.warn("RevenueCat ログアウト失敗:", err);
        });

        const queryClient = getQueryClient();
        queryClient.clear();

        Promise.all([
          import("@/stores/practiceFormStore"),
          import("@/stores/practiceFilterStore"),
          import("@/stores/practiceTimeStore"),
          import("@/stores/competitionFormStore"),
          import("@/stores/recordStore"),
        ])
          .then(
            ([
              { usePracticeFormStore },
              { usePracticeFilterStore },
              { usePracticeTimeStore },
              { useCompetitionFormStore },
              { useRecordStore },
            ]) => {
              usePracticeFormStore.getState().reset();
              usePracticeFilterStore.getState().reset();
              usePracticeTimeStore.getState().reset();
              useCompetitionFormStore.getState().reset();
              useRecordStore.getState().reset();
            },
          )
          .catch((error) => {
            console.warn("ストアのリセットに失敗:", error);
          });
      }
    });

    // ---- グローバルディープリンクハンドラ ----
    // メール確認リンクはメールアプリから直接タップされるため Linking で受け取る必要がある。
    // oauthSessionGuard.active が true のときは useGoogleAuth / IdentityLinkSettings に委ね、二重 setSession を防ぐ。

    const handleDeepLink = async (url: string) => {
      if (!isMounted) return;
      if (!isEmailAuthCallback(url)) return;
      // OAuth (openAuthSessionAsync) 進行中はスキップ
      if (oauthSessionGuard.active) return;
      if (!supabase) return;

      // 新形式: Supabase メールテンプレートの token_hash + type
      // (isEmailAuthCallback が type=recovery を除外済みのため、ここに来るのは
      // signup / email_change / email / magiclink のいずれか)
      const tokenHashResult = extractTokenHashFromUrl(url);
      if (tokenHashResult) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          type: tokenHashResult.type,
          token_hash: tokenHashResult.tokenHash,
        });
        if (!isMounted) return;
        if (otpError) {
          Alert.alert(
            i18n.t("common.alertErrorTitle"),
            i18n.t("auth.supabaseErrors.invalidToken"),
          );
          return;
        }
        // 成功時は onAuthStateChange が発火し自動でルート切替する
        return;
      }

      // Android の Custom Tabs は別プロセスで開くため、Googleカレンダー連携の同意画面
      // 操作中にアプリプロセスが kill され、このハンドラにコールドスタートとして
      // 届くケースがある。永続フラグはあくまで「カレンダー連携中に中断した可能性がある」
      // という手がかりに過ぎず、TTL(10分)内に無関係な認証コールバック(メール確認・
      // 通常のGoogleログインのコールドスタート)が届くケースもあるため、
      // 必ず URL 自体の証跡(flow=calendar-connect クエリ、または
      // provider_refresh_token フラグメント)と AND で判定する。
      const isPendingFlagSet = await consumeCalendarConnectPending();

      const tokens = extractTokensFromUrl(url);

      // PKCE 移行後、provider_refresh_token は URL (フラグメント) には現れず
      // exchangeCodeForSession のセッション結果にのみ含まれる想定のため、
      // ここでの判定は hasCalendarConnectFlowFlag が主たる根拠になる。
      // tokens.providerRefreshToken は implicit フォールバック経路のための保険として残す。
      const isCalendarConnectRecovery =
        isPendingFlagSet && (hasCalendarConnectFlowFlag(url) || !!tokens.providerRefreshToken);

      if (tokens.error) {
        if (!isMounted) return;
        Alert.alert(
          i18n.t("common.alertErrorTitle"),
          isCalendarConnectRecovery
            ? i18n.t("auth.mobile.googleCalendarPermissionDenied")
            : i18n.t("auth.supabaseErrors.tokenExpired"),
        );
        return;
      }

      // PKCE: クエリの認可コードを優先して exchangeCodeForSession で交換する。
      // code_verifier は AsyncStorage に保存されているが、コールドスタートで
      // 既に消費/期限切れの場合は AuthPKCECodeVerifierMissingError 等が
      // error として返る（例外は投げない）ため、ここで通常のエラー表示に倒す。
      if (tokens.code) {
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          tokens.code,
        );
        if (!isMounted) return;

        if (exchangeError || !data.session) {
          Alert.alert(
            i18n.t("common.alertErrorTitle"),
            isCalendarConnectRecovery
              ? i18n.t("auth.mobile.googleCalendarPermissionDenied")
              : i18n.t("auth.supabaseErrors.invalidToken"),
          );
          return;
        }

        // コールドスタート復帰でカレンダー連携が中断していた場合、
        // provider_refresh_token の保存をここで完了させる（取りこぼし防止）。
        // isCalendarConnectRecovery が false の場合（無関係な認証コールバックへの
        // 誤爆判定回避）は、通常のメール確認/ログイン処理のみで完了する。
        if (isCalendarConnectRecovery) {
          await completeCalendarConnectRecovery(
            data.session.access_token,
            data.session.provider_refresh_token ?? null,
          );
        }
        // 成功時は onAuthStateChange が発火し自動でルート切替する
        return;
      }

      // implicit フォールバック (flowType が pkce でない/フラグメント形式で返ってきた場合)
      if (tokens.accessToken && tokens.refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
        });
        // setSession 完了後にマウント状態を確認してから UI 操作
        if (!isMounted) return;
        if (sessionError) {
          Alert.alert(
            i18n.t("common.alertErrorTitle"),
            i18n.t("auth.supabaseErrors.invalidToken"),
          );
          return;
        }

        // コールドスタート復帰でカレンダー連携が中断していた場合、
        // provider_refresh_token の保存をここで完了させる（取りこぼし防止）。
        // isCalendarConnectRecovery が false の場合（無関係な認証コールバックへの
        // 誤爆判定回避）は、通常のメール確認/ログイン処理のみで完了する。
        if (isCalendarConnectRecovery) {
          await completeCalendarConnectRecovery(tokens.accessToken, tokens.providerRefreshToken);
        }
        // 成功時は onAuthStateChange が発火し自動でルート切替する
        return;
      }

      if (!isMounted) return;
      // code / access_token / refresh_token いずれも取れなかった場合
      if (isCalendarConnectRecovery) {
        // カレンダー連携中断からの復帰なのにトークンが無い場合もサイレントに
        // 握りつぶさず、再試行を促すエラーを表示する
        Alert.alert(
          i18n.t("common.alertErrorTitle"),
          i18n.t("auth.mobile.googleCalendarPermissionDenied"),
        );
        return;
      }
      Alert.alert(
        i18n.t("common.alertErrorTitle"),
        i18n.t("auth.mobile.tokensNotReceived"),
      );
    };

    // コールドスタート: アプリが閉じた状態からリンクで起動したケース
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    }).catch(() => {
      // getInitialURL の失敗はウォームスタートで補完されるため無視する
    });

    // ウォームスタート: アプリが起動中にリンクをタップしたケース
    const linkingSubscription = Linking.addEventListener("url", ({ url }) => {
      handleDeepLink(url);
    });

    // クリーンアップ関数
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      clearTimeout(hardTimeoutId);
      subscription.unsubscribe();
      linkingSubscription.remove();
    };
  }, []);

  // supabaseがnullの場合のフォールバック（実際には使用されない）
  const value: MobileAuthContextType = {
    ...authState,
    supabase: supabase || ({} as SupabaseClient<Database>),
    signIn,
    signUp,
    signInWithOAuth,
    signOut,
    resetPassword,
    updatePassword,
    updateProfile,
    refreshSubscription,
    isAuthenticated: !!authState.user,
    updateOnboardingCompleted,
    getAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): MobileAuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
