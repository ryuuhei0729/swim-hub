// =============================================================================
// 記録関連型定義 - Swim Hub
// 記録、スプリットタイム、エントリーの型
// =============================================================================

import type { CalendarItemType, PoolType, Style } from './common'
import type { Competition } from './competition'
import type { Team } from './team'
import type { UserProfile } from './user'

// =============================================================================
// 1. 基本型定義
// =============================================================================

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
  reaction_time?: number | null // 反応時間（リアクションタイム）を秒単位で記録。範囲は0.40~1.00秒程度。
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
