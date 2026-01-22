// =============================================================================
// 認証関連の型定義 - Swim Hub共通パッケージ
// Web/Mobile共通で使用する認証関連の型定義
// =============================================================================

import { AuthError, Session, SupabaseClient, User } from '@supabase/supabase-js'

// =============================================================================
// 1. 認証状態の型定義
// =============================================================================

export interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
}

// =============================================================================
// 2. 認証コンテキストの型定義
// =============================================================================

export interface AuthContextType extends AuthState {
  supabase: SupabaseClient
  signIn: (email: string, password: string) => Promise<{ data: { user: User | null; session: Session | null } | null; error: AuthError | null }>
  signUp: (email: string, password: string, name?: string, gender?: number, birthday?: string) => Promise<{ data: { user: User | null; session: Session | null } | null; error: AuthError | null }>
  signInWithOAuth: (provider: 'google', options?: { redirectTo?: string; scopes?: string; queryParams?: Record<string, string> }) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<{ error: AuthError | null }>
  resetPassword: (email: string) => Promise<{ data: null; error: AuthError | null }>
  updatePassword: (newPassword: string) => Promise<{ data: { user: User } | null; error: AuthError | null }>
  updateProfile: (updates: Partial<import('./index').UserProfile>) => Promise<{ error: AuthError | null }>
  isAuthenticated: boolean
}
