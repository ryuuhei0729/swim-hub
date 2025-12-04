// =============================================================================
// データベース型定義 - Swim Hub共通パッケージ
// Supabase直接アクセス用の型定義
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'

// =============================================================================
// 1. 基本型定義
// =============================================================================

// ユーザープロフィール
export interface UserProfile {
  id: string
  name: string
  gender: number // 0: 男性, 1: 女性
  birthday: string | null
  profile_image_path: string | null
  bio: string | null
  created_at: string
  updated_at: string
}

export type UserInsert = Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>
export type UserUpdate = Partial<UserInsert>

// 種目
export interface Style {
  id: number
  name_jp: string
  name: string
  style: 'fr' | 'br' | 'ba' | 'fly' | 'im'
  distance: number
}

// 練習（日単位）
export interface Practice {
  id: string
  user_id: string
  date: string
  title: string | null // 練習タイトル（NULLの場合は「練習」と表示）
  place: string | null
  note: string | null
  team_id?: string | null
  attendance_status?: AttendanceStatusType | null // 出欠提出ステータス
  created_at: string
  updated_at: string
  // CalendarItemとの互換性のための追加プロパティ
  item_type?: CalendarItemType
  item_date?: string
  // placeは上で定義済み（string | null）なので削除
  time_result?: number
  pool_type?: PoolType
  tags?: string[]
  competition_name?: string
  is_relaying?: boolean
  team_practice?: boolean
  team_record?: boolean
  style?: {
    id: string
    name_jp: string
    distance: number
  }
  practiceLogs?: PracticeLog[]
  practice_logs?: PracticeLog[]
}

export type PracticeInsert = Omit<Practice, 'id' | 'created_at' | 'updated_at'>
export type PracticeUpdate = Partial<Omit<PracticeInsert, 'user_id'>>

// 練習ログ（セット単位）
export interface PracticeLog {
  id: string
  user_id: string
  practice_id: string
  style: string
  rep_count: number
  set_count: number
  distance: number
  circle: number | null
  note: string | null
  created_at: string
  updated_at: string
}

export type PracticeLogInsert = Omit<PracticeLog, 'id' | 'created_at' | 'updated_at'>
export type PracticeLogUpdate = Partial<Omit<PracticeLogInsert, 'practice_id'>>

// 練習タイム
export interface PracticeTime {
  id: string
  user_id: string
  practice_log_id: string
  set_number: number
  rep_number: number
  time: number
  created_at: string
}

export type PracticeTimeInsert = Omit<PracticeTime, 'id' | 'created_at'>
export type PracticeTimeUpdate = Partial<Omit<PracticeTimeInsert, 'practice_log_id'>>

// 練習タグ
export interface PracticeTag {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
  updated_at: string
}

export type PracticeTagInsert = Omit<PracticeTag, 'id' | 'created_at' | 'updated_at'>
export type PracticeTagUpdate = Partial<Omit<PracticeTagInsert, 'user_id'>>

// 練習ログタグ関連
export interface PracticeLogTag {
  id: string
  practice_log_id: string
  practice_tag_id: string
  created_at: string
}

export type PracticeLogTagInsert = Omit<PracticeLogTag, 'id' | 'created_at'>

// 大会
export interface Competition {
  id: string
  user_id: string | null
  team_id?: string | null
  title: string | null // 大会名（NULLの場合は「大会」と表示）
  date: string
  end_date?: string | null // 大会終了日（複数日開催の場合）。NULLの場合は単日開催。
  place: string | null
  pool_type: number // 0: 短水路, 1: 長水路（NOT NULL）
  entry_status?: 'before' | 'open' | 'closed' // エントリーステータス（デフォルト: before）
  attendance_status?: AttendanceStatusType | null // 出欠提出ステータス
  note: string | null
  created_at: string
  updated_at: string
}

export type CompetitionInsert = Omit<Competition, 'id' | 'created_at' | 'updated_at'>
export type CompetitionUpdate = Partial<Omit<CompetitionInsert, 'user_id'>>

// 記録
export interface Record {
  id: string
  user_id: string
  competition_id: string | null
  style_id: number
  time: number
  video_url: string | null
  note: string | null
  is_relaying: boolean
  created_at: string
  updated_at: string
  // CalendarItemとの互換性のための追加プロパティ
  item_type?: CalendarItemType
  item_date?: string
  title?: string
  place?: string
  time_result?: number
  pool_type: PoolType // DB上はNOT NULL
  tags?: string[]
  competition_name?: string
  team_practice?: boolean
  team_record?: boolean
  split_times?: SplitTime[]
  competition?: Competition | null
  style?: Style
}

export type RecordInsert = Omit<Record, 'id' | 'created_at' | 'updated_at'>
export type RecordUpdate = Partial<Omit<RecordInsert, 'user_id'>>

// スプリットタイム
export interface SplitTime {
  id: string
  record_id: string
  distance: number
  split_time: number
  created_at: string
}

export type SplitTimeInsert = Omit<SplitTime, 'id' | 'created_at'>
export type SplitTimeUpdate = Partial<Omit<SplitTimeInsert, 'record_id'>>

// チーム
export interface Team {
  id: string
  name: string
  description: string | null
  invite_code: string
  created_at: string
  updated_at: string
}

export type TeamInsert = Omit<Team, 'id' | 'invite_code' | 'created_at' | 'updated_at'>
export type TeamUpdate = Partial<TeamInsert>

// チームメンバーシップ
export interface TeamMembership {
  id: string
  team_id: string
  user_id: string
  role: 'admin' | 'user'
  member_type: 'swimmer' | 'coach' | 'director' | 'manager' | null
  group_name: string | null
  is_active: boolean
  joined_at: string
  left_at: string | null
  created_at: string
  updated_at: string
}

export type TeamMembershipInsert = Omit<TeamMembership, 'id' | 'created_at' | 'updated_at'>
export type TeamMembershipUpdate = Partial<Omit<TeamMembershipInsert, 'team_id' | 'user_id'>>

// チームお知らせ
export interface TeamAnnouncement {
  id: string
  team_id: string
  title: string
  content: string
  created_by: string
  is_published: boolean
  start_at: string | null
  end_at: string | null
  created_at: string
  updated_at: string
}

export type TeamAnnouncementInsert = Omit<TeamAnnouncement, 'id' | 'created_at' | 'updated_at'>
export type TeamAnnouncementUpdate = Partial<Omit<TeamAnnouncementInsert, 'team_id' | 'created_by'>>

// フォーム用の型定義（camelCase）
export interface CreateTeamAnnouncementInput {
  teamId: string
  title: string
  content: string
  isPublished?: boolean
  publishedAt?: string | null
}

export interface UpdateTeamAnnouncementInput {
  id: string
  title?: string
  content?: string
  isPublished?: boolean
  publishedAt?: string | null
}

// 出欠管理
export type AttendanceStatus = 'present' | 'absent' | 'other'
export type AttendanceStatusType = 'open' | 'closed'

export interface TeamAttendance {
  id: string
  practice_id: string | null
  competition_id: string | null
  user_id: string
  status: AttendanceStatus | null // null = 未回答
  note: string | null
  created_at: string
  updated_at: string
}

export type TeamAttendanceInsert = Omit<TeamAttendance, 'id' | 'created_at' | 'updated_at'>
export type TeamAttendanceUpdate = Partial<Omit<TeamAttendanceInsert, 'user_id'>>

// 大会エントリー（個人・チーム共通）
export interface Entry {
  id: string
  team_id: string | null // NULL = 個人エントリー
  competition_id: string
  user_id: string
  style_id: number
  entry_time: number | null // エントリータイム（秒）
  note: string | null
  created_at: string
  updated_at: string
}

export type EntryInsert = Omit<Entry, 'id' | 'created_at' | 'updated_at'>
export type EntryUpdate = Partial<Omit<EntryInsert, 'competition_id' | 'user_id'>>

// =============================================================================
// 2. リレーション付き型定義（JOIN結果）
// =============================================================================

// 練習ログ with タイム
export interface PracticeLogWithTimes extends PracticeLog {
  practice_times: PracticeTime[]
}

// 練習ログ with タイム & タグ
export interface PracticeLogWithTags extends PracticeLogWithTimes {
  practice_log_tags: Array<{
    practice_tag_id: string
    practice_tags: PracticeTag
  }>
}

// 練習 with ログ・タイム・タグ
export interface PracticeWithLogs extends Practice {
  practice_logs: PracticeLogWithTags[]
}

// 記録 with 大会・種目・スプリット
export interface RecordWithDetails extends Record {
  competition: Competition | null
  style: Style
  split_times: SplitTime[]
}

// エントリー with 大会・種目・ユーザー
export interface EntryWithDetails extends Entry {
  competition: Competition
  style: Style
  user: UserProfile
  team?: Team | null
}

// チーム with メンバー
export interface TeamWithMembers extends Team {
  team_memberships: (TeamMembership & {
    user: UserProfile
  })[]
}

// チームメンバーシップ with ユーザー
export interface TeamMembershipWithUser extends TeamMembership {
  users: UserProfile
  teams: Team
}

// 出欠管理 with ユーザー・練習・大会（JOINでteam_idを取得）
export interface TeamAttendanceWithDetails extends TeamAttendance {
  user: UserProfile
  practice?: Practice | null
  competition?: Competition | null
  // JOINで取得したteam_id
  team_id?: string | null
}

// =============================================================================
// 3. アプリケーション固有の型定義
// =============================================================================

// プール種別
export type PoolType = 0 | 1 // 0: 短水路, 1: 長水路

// 性別
export type Gender = 0 | 1 // 0: 男性, 1: 女性

// 泳法
export type SwimStyle = 'fr' | 'br' | 'ba' | 'fly' | 'im'

// カレンダーアイテムタイプ
// 注意: この型はCALENDAR_ITEM_TYPES定数から導出可能
// export type CalendarItemType = typeof CALENDAR_ITEM_TYPES[number]
export type CalendarItemType = 
  | 'practice'           // 個人練習
  | 'team_practice'     // チーム練習
  | 'practice_log'      // 練習ログ
  | 'competition'       // 個人大会
  | 'team_competition'  // チーム大会
  | 'entry'             // 大会エントリー（記録未登録）
  | 'record'            // 大会記録

// チームロール
export type TeamRole = 'admin' | 'user'

// メンバータイプ
export type MemberType = 'swimmer' | 'coach' | 'director' | 'manager'

// =============================================================================
// 4. 定数
// =============================================================================

export const POOL_TYPES = {
  SHORT: 0 as const,
  LONG: 1 as const
} as const

export const GENDERS = {
  MALE: 0 as const,
  FEMALE: 1 as const
} as const

export const SWIM_STYLES = ['Fr', 'Ba', 'Br', 'Fly', 'IM'] as const

// カレンダーアイテムタイプの定数（Single Source of Truth）
export const CALENDAR_ITEM_TYPES = [
  'practice',           // 個人練習
  'team_practice',     // チーム練習
  'practice_log',      // 練習ログ
  'competition',       // 個人大会
  'team_competition',  // チーム大会
  'entry',             // 大会エントリー（記録未登録）
  'record'            // 大会記録
] as const

// =============================================================================
// 5. 型ガード
// =============================================================================

export const isPoolType = (value: any): value is PoolType => {
  return value === 0 || value === 1
}

export const isGender = (value: any): value is Gender => {
  return value === 0 || value === 1
}

export const isSwimStyle = (value: any): value is SwimStyle => {
  return ['fr', 'br', 'ba', 'fly', 'im'].includes(value)
}

export const isCalendarItemType = (value: any): value is CalendarItemType => {
  return (CALENDAR_ITEM_TYPES as readonly string[]).includes(value)
}

export const isTeamRole = (value: any): value is TeamRole => {
  return value === 'admin' || value === 'user'
}

// =============================================================================
// 6. ユーティリティ型
// =============================================================================

export type ID = string
export type DateString = string

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>

// Supabase Client型
export type SupabaseClientType = SupabaseClient

// =============================================================================
// 7. イベント型定義（チーム関連）
// =============================================================================

// 練習イベント
export interface PracticeEvent extends Practice {
  type: 'practice'
}

// 大会イベント
export interface CompetitionEvent extends Competition {
  type: 'competition'
}

// チームイベント（ユニオン型）
export type TeamEvent = PracticeEvent | CompetitionEvent

