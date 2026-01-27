// =============================================================================
// 大会関連型定義 - Swim Hub
// 大会と大会画像の型
// =============================================================================

import type { AttendanceStatusType } from './common'

// =============================================================================
// 1. 基本型定義
// =============================================================================

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
  google_event_id?: string | null // Google CalendarイベントID
  image_paths?: string[] // 画像パスの配列（R2/Storageのパス）
  note: string | null
  created_at: string
  updated_at: string
}

export type CompetitionInsert = Omit<Competition, 'id' | 'created_at' | 'updated_at'>
export type CompetitionUpdate = Partial<Omit<CompetitionInsert, 'user_id'>>

/**
 * 大会画像
 * @deprecated competition_imagesテーブルは廃止予定。competitions.image_pathsを使用してください。
 */
export interface CompetitionImage {
  id: string
  competition_id: string
  user_id: string
  original_path: string
  thumbnail_path: string
  file_name: string
  file_size: number
  display_order: number
  created_at: string
  updated_at: string
}

/** @deprecated */
export type CompetitionImageInsert = Omit<CompetitionImage, 'id' | 'created_at' | 'updated_at'>
/** @deprecated */
export type CompetitionImageUpdate = Partial<Omit<CompetitionImageInsert, 'competition_id' | 'user_id'>>
