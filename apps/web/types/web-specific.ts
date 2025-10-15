// =============================================================================
// Web専用型定義 - Swim Hub Webアプリケーション
// Next.js App Router専用の型定義
// =============================================================================

import { UserProfile } from '@shared/types/database'

// =============================================================================
// 1. 認証関連の型定義（Web専用）
// =============================================================================

export interface AuthState {
  user: any | null
  profile: UserProfile | null
  session: any | null
  loading: boolean
}

export interface AuthContextType extends AuthState {
  supabase: any
  signIn: (email: string, password: string) => Promise<{ data: any; error: any }>
  signUp: (email: string, password: string, name?: string) => Promise<{ data: any; error: any }>
  signOut: () => Promise<{ error: any }>
  resetPassword: (email: string) => Promise<{ error: any }>
  updatePassword: (newPassword: string) => Promise<{ error: any }>
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error: any }>
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
  days: any[] // CalendarDay[]は共通型から取得
  summary: any // CalendarSummaryは共通型から取得
}
