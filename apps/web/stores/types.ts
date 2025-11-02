// =============================================================================
// Zustandストア用型定義
// =============================================================================

import type { PracticeTag } from '@apps/shared/types/database'
import type { CalendarItem, EntryInfo, TimeEntry } from '@apps/shared/types/ui'

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
      entryData?: EntryInfo
      metadata?: {
        practice?: { place?: string }
        competition?: { title?: string; place?: string }
        record?: { competition_id?: string | null }
      }
      date?: string
      note?: string
      style?: string
      style_id?: number
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
  practiceDate?: string
  location?: string
  note?: string
  style?: string
  reps?: number
  sets?: number
  distance?: number
  circleTime?: number | null
  tags?: PracticeTag[]
  times?: TimeEntry[]
}

export interface EntryFormData {
  id: string
  styleId: string
  entryTime: number
  note: string
}

// 入力型（フォームで使用） - distanceはstring
export interface RecordFormDataInput {
  styleId: string
  time: number
  videoUrl?: string | null
  note?: string | null
  isRelaying: boolean
  splitTimes: Array<{
    distance: string | number
    splitTime: number
  }>
}

// 内部型（処理済み） - distanceはnumber
export interface RecordFormData {
  styleId: string
  time: number
  videoUrl?: string | null
  note?: string | null
  isRelaying: boolean
  splitTimes: Array<{
    distance: number
    splitTime: number
  }>
}

// 型変換関数
export const convertRecordFormData = (input: RecordFormDataInput): RecordFormData => {
  return {
    ...input,
    splitTimes: input.splitTimes
      .map(st => {
        const distance = typeof st.distance === 'number' 
          ? st.distance 
          : (st.distance === '' ? NaN : Number(st.distance))
        
        // 有効な数値のみ含める
        if (!isNaN(distance) && distance > 0 && st.splitTime > 0) {
          return {
            distance,
            splitTime: st.splitTime
          }
        }
        return null
      })
      .filter((st): st is { distance: number; splitTime: number } => st !== null)
  }
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

