// =============================================================================
// Zustandストア用型定義
// =============================================================================

import type { CalendarItem, TimeEntry } from '@apps/shared/types/ui'
import type { PracticeTag, Style, Entry } from '@apps/shared/types/database'

// =============================================================================
// 編集データ型定義（統一）
// =============================================================================

export type EditingData = 
  | CalendarItem 
  | {
      id?: string
      type?: string
      competition_id?: string | null
      practice_id?: string
      entryData?: unknown
      metadata?: {
        practice?: { place?: string }
        competition?: { title?: string; place?: string }
        record?: { competition_id?: string | null }
      }
      date?: string
      note?: string
      style_id?: string | number
      time?: number
      is_relaying?: boolean
      video_url?: string | null
      split_times?: Array<{ distance: number; split_time: number }>
    }
  | null

// =============================================================================
// 練習記録フォーム型定義
// =============================================================================

export interface PracticeMenuFormData {
  style: string
  distance: number
  reps: number
  sets: number
  circleTime: number | null
  note: string
  tags: PracticeTag[]
  times: TimeEntry[]
}

export interface EntryFormData {
  id: string
  styleId: string
  entryTime: number
  note: string
}

export interface RecordFormData {
  styleId: string
  time: number
  videoUrl?: string | null
  note?: string | null
  isRelaying: boolean
  splitTimes: Array<{
    distance: number | string
    splitTime: number
  }>
}

export interface EntryWithStyle {
  id: string
  competition_id: string
  user_id: string
  style_id: number
  entry_time: number | null
  note: string | null
  team_id?: string | null
  styleName?: string
}

