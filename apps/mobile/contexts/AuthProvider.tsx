import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    subscription: null,
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
          "Supabaseクライアントが初期化されていません",
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
          "Supabaseクライアントが初期化されていません",
        ) as import("@supabase/supabase-js").AuthError,
      };
    }
    try {
      // モバイルアプリでは、メール認証のリダイレクトURLは後で実装（Phase 2.2で対応）
      // 現時点では空文字列を使用
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name || "",
          },
          // メール認証のリダイレクトURLは後で実装
        },
      });

      if (error) {
        return { data: null, error: error as import("@supabase/supabase-js").AuthError };
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
            "Supabaseクライアントが初期化されていません",
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
          "Supabaseクライアントが初期化されていません",
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
          "Supabaseクライアントが初期化されていません",
        ) as import("@supabase/supabase-js").AuthError,
      };
    }
    try {
      // モバイルアプリでは、パスワードリセットのリダイレクトURLは後で実装（Phase 2.3で対応）
      // 現時点では空文字列を使用
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        // リダイレクトURLは後で実装
      });

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
          "Supabaseクライアントが初期化されていません",
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
            "Supabaseクライアントが初期化されていません",
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

  // user が変わったらサブスクリプションを取得 & RevenueCat にログイン
  useEffect(() => {
    if (authState.user) {
      loginRevenueCat(authState.user.id);
      fetchSubscription(authState.user.id).then((sub) => {
        if (sub !== null) {
          setAuthState((prev) => ({ ...prev, subscription: sub }));
        }
      });
    } else {
      setAuthState((prev) => ({ ...prev, subscription: null }));
    }
  }, [authState.user, fetchSubscription]);

  useEffect(() => {
    let isMounted = true;

    // Supabaseクライアントが初期化されていない場合の処理
    if (!supabase) {
      console.error("Supabaseクライアントが初期化されていません");
      setAuthState({
        user: null,
        session: null,
        loading: false,
        subscription: null,
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

    // クリーンアップ関数
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      clearTimeout(hardTimeoutId);
      subscription.unsubscribe();
    };
  }, []);

  // supabaseがnullの場合のフォールバック（実際には使用されない）
  const value: AuthContextType = {
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
