// =============================================================================
// Web専用型定義 - Swim Hub Webアプリケーション
// Next.js App Router専用の型定義
// =============================================================================

import { UserProfile } from '@apps/shared/types/database'
import { CalendarDay } from '@apps/shared/types/ui'
import { AuthError, Session, SupabaseClient, User } from '@supabase/supabase-js'

// =============================================================================
// 1. 認証関連の型定義（Web専用）
// =============================================================================

export interface AuthState {
  user: User | null
  profile: UserProfile | null
  session: Session | null
  loading: boolean
}

export interface AuthContextType extends AuthState {
  supabase: SupabaseClient
  signIn: (email: string, password: string) => Promise<{ data: { user: User | null; session: Session | null } | null; error: AuthError | null }>
  signUp: (email: string, password: string, name?: string) => Promise<{ data: { user: User | null; session: Session | null } | null; error: AuthError | null }>
  signOut: () => Promise<{ error: AuthError | null }>
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>
  updatePassword: (newPassword: string) => Promise<{ error: AuthError | null }>
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error: AuthError | null }>
  isAuthenticated: boolean
  isLoading: boolean
}

// =============================================================================
// 2. Web専用の追加型定義
// =============================================================================

// カレンダーデータ（Web専用）
export interface CalendarData {
  year: number
  month: number
  days: CalendarDay[]
}
