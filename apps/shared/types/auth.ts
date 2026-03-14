// =============================================================================
// 認証関連の型定義 - Swim Hub共通パッケージ
// Web/Mobile共通で使用する認証関連の型定義
// =============================================================================

import type { AuthError, Session, SupabaseClient, User } from "@supabase/supabase-js";

// =============================================================================
// 1. 3アプリ共通の認証ベース型 (AuthState / AuthActions / AuthContextValue)
// =============================================================================

/** 3アプリ共通の認証状態 */
export type BaseAuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
};

/** 3アプリ共通の認証アクション */
export type BaseAuthActions = {
  signOut: () => Promise<void>;
};

/** 3アプリ共通の認証コンテキスト値 */
export type BaseAuthContextValue = BaseAuthState & BaseAuthActions;

// =============================================================================
// 2. サブスクリプション型定義 (swim-hub 固有)
// =============================================================================

export type SubscriptionStatus = "trialing" | "active" | "canceled" | "expired" | "past_due";

export interface SubscriptionInfo {
  plan: "free" | "premium";
  status: SubscriptionStatus | null;
  cancelAtPeriodEnd: boolean;
  premiumExpiresAt: string | null;
  trialEnd: string | null;
}

// =============================================================================
// 3. swim-hub 固有の認証状態 (BaseAuthState を拡張)
// =============================================================================

export interface AuthState extends BaseAuthState {
  subscription: SubscriptionInfo | null;
}

// =============================================================================
// 4. swim-hub 固有の認証コンテキスト (AuthState + アプリ固有アクション)
// =============================================================================

export interface AuthContextType extends AuthState {
  supabase: SupabaseClient;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{
    data: { user: User | null; session: Session | null } | null;
    error: AuthError | null;
  }>;
  signUp: (
    email: string,
    password: string,
    name?: string,
    gender?: number,
    birthday?: string,
  ) => Promise<{
    data: { user: User | null; session: Session | null } | null;
    error: AuthError | null;
  }>;
  signInWithOAuth: (
    provider: "google" | "apple",
    options?: { redirectTo?: string; scopes?: string; queryParams?: Record<string, string> },
  ) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
  resetPassword: (email: string) => Promise<{ data: null; error: AuthError | null }>;
  updatePassword: (
    newPassword: string,
  ) => Promise<{ data: { user: User } | null; error: AuthError | null }>;
  updateProfile: (
    updates: Partial<import("./index").UserProfile>,
  ) => Promise<{ error: AuthError | null }>;
  refreshSubscription: () => Promise<void>;
  isAuthenticated: boolean;
}
