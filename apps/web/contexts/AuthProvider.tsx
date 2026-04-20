"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@swim-hub/shared/types";
import type { Session } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { getQueryClient } from "@/providers/QueryProvider";
import { AuthContextType } from "@swim-hub/shared/types/auth";
import { useSubscription } from "@/hooks/useSubscription";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 認証状態（subscription を除く）
type CoreAuthState = {
  user: import("@supabase/supabase-js").User | null;
  session: Session | null;
  loading: boolean;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  // supabase.tsから統一されたBrowser Clientを使用
  // これにより、PKCE code verifierが確実にCookieに保存・読み取りされる
  const supabaseClient = useMemo((): SupabaseClient<Database> | null => {
    // サーバー側（ビルド時）では実行しない
    if (typeof window === "undefined") {
      return null;
    }
    return supabase || null;
  }, []);

  const [coreState, setCoreState] = useState<CoreAuthState>({
    user: null,
    session: null,
    loading: true,
  });

  // subscription は React Query で管理（Server Component からハイドレート済み）
  const { subscription, refreshSubscription } = useSubscription(coreState.user?.id ?? null);

  // ログイン
  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabaseClient) {
        return {
          data: null,
          error: new Error(
            "Supabaseクライアントが初期化されていません",
          ) as import("@supabase/supabase-js").AuthError,
        };
      }
      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          return { data: null, error: error as import("@supabase/supabase-js").AuthError };
        }

        return { data: data ? { user: data.user, session: data.session } : null, error: null };
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("Sign in error:", error);
        }
        return { data: null, error: error as import("@supabase/supabase-js").AuthError };
      }
    },
    [supabaseClient],
  );

  // サインアップ
  const signUp = useCallback(
    async (email: string, password: string, name?: string, gender?: number, birthday?: string) => {
      if (!supabaseClient) {
        return {
          data: null,
          error: new Error(
            "Supabaseクライアントが初期化されていません",
          ) as import("@supabase/supabase-js").AuthError,
        };
      }
      try {
        // 重要: emailRedirectToは必ずwindow.location.originを直接使用する
        // 環境変数を使うと、PKCE code verifier Cookieが保存されない
        if (typeof window === "undefined") {
          return {
            data: null,
            error: new Error(
              "ブラウザ環境で実行してください",
            ) as import("@supabase/supabase-js").AuthError,
          };
        }

        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: name || "",
              gender: gender ?? 0,
              birthday: birthday || null,
            },
            emailRedirectTo: `${window.location.origin}/api/auth/callback?redirect_to=/onboarding`,
          },
        });

        if (error) {
          return { data: null, error: error as import("@supabase/supabase-js").AuthError };
        }

        return { data: data ? { user: data.user, session: data.session } : null, error: null };
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("Sign up error:", error);
        }
        return { data: null, error: error as import("@supabase/supabase-js").AuthError };
      }
    },
    [supabaseClient],
  );

  // OAuth認証（Google / Apple）
  const signInWithOAuth = useCallback(
    async (
      provider: "google" | "apple",
      options?: { redirectTo?: string; scopes?: string; queryParams?: Record<string, string> },
    ) => {
      if (!supabaseClient) {
        return {
          error: new Error(
            "Supabaseクライアントが初期化されていません",
          ) as import("@supabase/supabase-js").AuthError,
        };
      }

      try {
        if (typeof window === "undefined") {
          return {
            error: new Error(
              "ブラウザ環境で実行してください",
            ) as import("@supabase/supabase-js").AuthError,
          };
        }
        // 重要: redirectToはルートパス(/)に設定し、Middlewareで/api/auth/callbackにリダイレクトさせる
        // これにより、PKCE code verifier Cookieが確実に転送される
        const redirectTo =
          options?.redirectTo || `${window.location.origin}/?redirect_to=/onboarding`;

        const { data, error } = await supabaseClient.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo,
            ...(options?.scopes && { scopes: options.scopes }),
            ...(options?.queryParams && { queryParams: options.queryParams }),
          },
        });

        if (error) {
          if (process.env.NODE_ENV !== "production") {
            console.error("OAuth signInWithOAuth error:", error);
          }
          return { error: error as import("@supabase/supabase-js").AuthError };
        }

        if (data.url && typeof window !== "undefined") {
          window.location.href = data.url;
        }

        return { error: null };
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("OAuth sign in error:", error);
        }
        return { error: error as import("@supabase/supabase-js").AuthError };
      }
    },
    [supabaseClient],
  );

  // クライアント側の全キャッシュ・ストアをクリア（冪等）
  const clearAllClientState = useCallback(async () => {
    const queryClient = getQueryClient();
    queryClient.clear();

    if (typeof window !== "undefined") {
      try {
        const {
          useProfileStore,
          useTeamStore,
          useUIStore,
          usePracticeStore,
          usePracticeRecordStore,
          useCompetitionStore,
          useCompetitionRecordStore,
          useCommonFormStore,
          useAttendanceTabStore,
          useTeamDetailStore,
          useTeamAdminStore,
          useModalStore,
        } = await import("@/stores");

        useProfileStore.getState().reset();
        useTeamStore.getState().reset();
        useUIStore.getState().reset();
        usePracticeStore.getState().reset();
        usePracticeRecordStore.getState().reset();
        useCompetitionStore.getState().reset();
        useCompetitionRecordStore.getState().reset();
        useCommonFormStore.getState().reset();
        useAttendanceTabStore.getState().reset();
        useTeamDetailStore.getState().reset();
        useTeamAdminStore.getState().reset();
        useModalStore.getState().reset();
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("ストアのリセットに失敗:", error);
        }
      }

      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("ストレージのクリアに失敗:", error);
        }
      }
    }
  }, []);

  // ログアウト
  const signOut = useCallback(async () => {
    if (!supabaseClient) {
      return {
        error: new Error(
          "Supabaseクライアントが初期化されていません",
        ) as import("@supabase/supabase-js").AuthError,
      };
    }
    try {
      await clearAllClientState();

      const { error } = await supabaseClient.auth.signOut();

      if (error) {
        return { error: error as import("@supabase/supabase-js").AuthError };
      }

      return { error: null };
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Sign out error:", error);
      }
      return { error: error as import("@supabase/supabase-js").AuthError };
    }
  }, [supabaseClient, clearAllClientState]);

  // パスワードリセット
  const resetPassword = useCallback(
    async (email: string) => {
      if (!supabaseClient) {
        return {
          data: null,
          error: new Error(
            "Supabaseクライアントが初期化されていません",
          ) as import("@supabase/supabase-js").AuthError,
        };
      }
      try {
        if (typeof window === "undefined") {
          return {
            data: null,
            error: new Error(
              "ブラウザ環境で実行してください",
            ) as import("@supabase/supabase-js").AuthError,
          };
        }

        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/api/auth/callback?redirect_to=/update-password`,
        });

        if (error) {
          return { data: null, error: error as import("@supabase/supabase-js").AuthError };
        }

        return { data: null, error: null };
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("Password reset error:", error);
        }
        return { data: null, error: error as import("@supabase/supabase-js").AuthError };
      }
    },
    [supabaseClient],
  );

  // パスワード更新
  const updatePassword = useCallback(
    async (newPassword: string) => {
      if (!supabaseClient) {
        return {
          data: null,
          error: new Error(
            "Supabaseクライアントが初期化されていません",
          ) as import("@supabase/supabase-js").AuthError,
        };
      }
      try {
        const { data, error } = await supabaseClient.auth.updateUser({
          password: newPassword,
        });

        if (error) {
          return { data: null, error: error as import("@supabase/supabase-js").AuthError };
        }

        return { data: data ? { user: data.user } : null, error: null };
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("Password update error:", error);
        }
        return { data: null, error: error as import("@supabase/supabase-js").AuthError };
      }
    },
    [supabaseClient],
  );

  // プロフィール更新
  const updateProfile = useCallback(
    async (updates: Partial<import("@swim-hub/shared/types").UserProfile>) => {
      if (!supabaseClient) {
        return {
          error: new Error(
            "Supabaseクライアントが初期化されていません",
          ) as import("@supabase/supabase-js").AuthError,
        };
      }
      try {
        if (!coreState.user) {
          return {
            error: new Error(
              "User not authenticated",
            ) as unknown as import("@supabase/supabase-js").AuthError,
          };
        }

        const { error } = await supabaseClient
          .from("users")
          .update(updates)
          .eq("id", coreState.user.id);

        if (error) {
          return { error: error as unknown as import("@supabase/supabase-js").AuthError };
        }

        return { error: null };
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("Profile update error:", error);
        }
        return { error: error as unknown as import("@supabase/supabase-js").AuthError };
      }
    },
    [coreState.user, supabaseClient],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !supabaseClient) {
      return;
    }

    let isMounted = true;

    // 認証状態の変更を監視
    const {
      data: { subscription: authSubscription },
    } = supabaseClient.auth.onAuthStateChange(async (event: string, session: Session | null) => {
      if (!isMounted) return;

      // loading: false — subscription を待たずに即座に認証状態を確定
      setCoreState({
        user: session?.user ?? null,
        session,
        loading: false,
      });

      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        if (event === "SIGNED_OUT") {
          await clearAllClientState();
        }

        const currentPath = window.location.pathname;
        const authPages = ["/login", "/signup", "/reset-password", "/auth/callback"];
        const isAuthPage = authPages.some((page) => currentPath.startsWith(page));

        if (!isAuthPage) {
          router.refresh();
        }
      }
    });

    // 初期セッションを取得
    // getSession() はローカルキャッシュ（JWT）を返す — ネットワーク不要で高速
    const fetchInitialSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabaseClient.auth.getSession();
        if (isMounted) {
          if (error) {
            if (process.env.NODE_ENV !== "production") {
              console.error("初期セッション取得エラー:", error);
            }
            setCoreState({ user: null, session: null, loading: false });
          } else {
            setCoreState({
              user: session?.user ?? null,
              session: session ?? null,
              loading: false,
            });
          }
        }
      } catch (error: unknown) {
        if (process.env.NODE_ENV !== "production") {
          console.error("初期セッション取得エラー:", error);
        }
        if (isMounted) {
          setCoreState({ user: null, session: null, loading: false });
        }
      }
    };

    fetchInitialSession();

    return () => {
      isMounted = false;
      authSubscription.unsubscribe();
    };
  }, [router, supabaseClient, clearAllClientState]);

  const value: AuthContextType = {
    ...coreState,
    subscription,
    supabase: supabaseClient || ({} as SupabaseClient<Database>),
    signIn,
    signUp,
    signInWithOAuth,
    signOut,
    resetPassword,
    updatePassword,
    updateProfile,
    refreshSubscription,
    isAuthenticated: !!coreState.user,
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
