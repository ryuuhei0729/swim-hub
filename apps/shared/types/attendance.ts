// =============================================================================
// 出欠管理関連型定義 - Swim Hub
// チーム出欠管理の型
// =============================================================================

import type { AttendanceStatus } from './common'
import type { Competition } from './competition'
import type { Practice } from './practice'
import type { UserProfile } from './user'

// =============================================================================
// 1. 基本型定義
// =============================================================================

// 出欠管理
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

// =============================================================================
// 2. リレーション付き型定義（JOIN結果）
// =============================================================================

// 出欠管理 with ユーザー・練習・大会（JOINでteam_idを取得）
export interface TeamAttendanceWithDetails extends TeamAttendance {
  user: UserProfile
  practice?: Practice | null
  competition?: Competition | null
  // JOINで取得したteam_id
  team_id?: string | null
}
