// =============================================================================
// 認証関連の型定義 - Swim Hub共通パッケージ
// Web/Mobile共通で使用する認証関連の型定義
// =============================================================================

import { AuthError, Session, SupabaseClient, User } from '@supabase/supabase-js'

// =============================================================================
// 1. サブスクリプション型定義
// =============================================================================

export type SubscriptionStatus = 'trialing' | 'active' | 'canceled' | 'expired' | 'past_due'

export interface SubscriptionInfo {
  plan: 'free' | 'premium'
  status: SubscriptionStatus | null
  cancelAtPeriodEnd: boolean
  premiumExpiresAt: string | null
  trialEnd: string | null
}

// =============================================================================
// 2. 認証状態の型定義
// =============================================================================

export interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  subscription: SubscriptionInfo | null
}

// =============================================================================
// 2. 認証コンテキストの型定義
// =============================================================================

export interface AuthContextType extends AuthState {
  supabase: SupabaseClient
  signIn: (email: string, password: string) => Promise<{ data: { user: User | null; session: Session | null } | null; error: AuthError | null }>
  signUp: (email: string, password: string, name?: string, gender?: number, birthday?: string) => Promise<{ data: { user: User | null; session: Session | null } | null; error: AuthError | null }>
  signInWithOAuth: (provider: 'google' | 'apple', options?: { redirectTo?: string; scopes?: string; queryParams?: Record<string, string> }) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<{ error: AuthError | null }>
  resetPassword: (email: string) => Promise<{ data: null; error: AuthError | null }>
  updatePassword: (newPassword: string) => Promise<{ data: { user: User } | null; error: AuthError | null }>
  updateProfile: (updates: Partial<import('./index').UserProfile>) => Promise<{ error: AuthError | null }>
  refreshSubscription: () => Promise<void>
  isAuthenticated: boolean
}
