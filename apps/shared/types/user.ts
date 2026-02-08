// =============================================================================
// ユーザー関連型定義 - Swim Hub
// ユーザープロフィールと関連する型
// =============================================================================

// ユーザープロフィール（クライアント側用 - 機密情報を除外）
export interface UserProfile {
  id: string
  name: string
  gender: number // 0: 男性, 1: 女性
  birthday: string | null
  profile_image_path: string | null
  bio: string | null
  google_calendar_enabled: boolean
  // google_calendar_refresh_token は機密情報のためクライアント側では除外（pgsodiumで暗号化済み）
  google_calendar_sync_practices: boolean
  google_calendar_sync_competitions: boolean
  // iOSカレンダー連携設定
  ios_calendar_enabled: boolean
  ios_calendar_sync_practices: boolean
  ios_calendar_sync_competitions: boolean
  created_at: string
  updated_at: string
}

export type UserInsert = Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>
export type UserUpdate = Partial<UserInsert>
