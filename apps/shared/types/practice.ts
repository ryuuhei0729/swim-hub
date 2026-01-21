// =============================================================================
// 練習関連型定義 - Swim Hub
// 練習、練習ログ、練習タイム、練習タグなどの型
// =============================================================================

import type { AttendanceStatusType, CalendarItemType, PoolType } from './common'

// =============================================================================
// 1. 基本型定義
// =============================================================================

// 練習（日単位）- DBテーブルカラムのみ
export interface BasePractice {
  id: string
  user_id: string
  date: string
  title: string | null // 練習タイトル（NULLの場合は「練習」と表示）
  place: string | null
  note: string | null
  team_id?: string | null
  attendance_status?: AttendanceStatusType | null // 出欠提出ステータス
  google_event_id?: string | null // Google CalendarイベントID
  created_at: string
  updated_at: string
}

// 練習 - DBカラム + 派生/互換性フィールド
export interface Practice extends BasePractice {
  // CalendarItemとの互換性のための追加プロパティ
  item_type?: CalendarItemType
  item_date?: string
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

export type PracticeInsert = Omit<BasePractice, 'id' | 'created_at' | 'updated_at'>
export type PracticeUpdate = Partial<Omit<PracticeInsert, 'user_id'>>

// 練習ログ（セット単位）
export interface PracticeLog {
  id: string
  user_id: string
  practice_id: string
  style: string
  swim_category: 'Swim' | 'Pull' | 'Kick'
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

// 練習画像
export interface PracticeImage {
  id: string
  practice_id: string
  user_id: string
  original_path: string
  thumbnail_path: string
  file_name: string
  file_size: number
  display_order: number
  created_at: string
  updated_at: string
}

export type PracticeImageInsert = Omit<PracticeImage, 'id' | 'created_at' | 'updated_at'>
export type PracticeImageUpdate = Partial<Omit<PracticeImageInsert, 'practice_id' | 'user_id'>>

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

// 練習ログタグ関連（M2M）
export interface PracticeLogTag {
  id: string
  practice_log_id: string
  practice_tag_id: string
  created_at: string
}

export type PracticeLogTagInsert = Omit<PracticeLogTag, 'id' | 'created_at'>

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
