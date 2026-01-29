// =============================================================================
// Zustandストア用型定義
// =============================================================================

import type { PracticeTag } from '@apps/shared/types'
import type { CalendarItem, EntryInfo, TimeEntry } from '@apps/shared/types/ui'

// =============================================================================
// 編集データ型定義（統一）
// =============================================================================

export type EditingData = 
  | CalendarItem 
  | {
      id?: string
      type?: string
      competitionId?: string | null
      practiceId?: string
      entryData?: EntryInfo
      entryDataList?: EntryInfo[]
      metadata?: {
        practice?: { place?: string }
        competition?: { title?: string; place?: string }
        record?: { competitionId?: string | null }
      }
      date?: string
      note?: string
      style?: string
      styleId?: number
      time?: number
      isRelaying?: boolean
      videoUrl?: string | null
      reactionTime?: number | null
      splitTimes?: Array<{ distance: number; splitTime: number }>
      // 練習ログ編集用のプロパティ
      swim_category?: 'Swim' | 'Pull' | 'Kick'
      distance?: number
      rep_count?: number
      set_count?: number
      circle?: number | null
      tags?: PracticeTag[]
      tag_ids?: string[]
      times?: Array<{ memberId: string; times: TimeEntry[] }>
    }
  | null

// =============================================================================
// 練習記録フォーム型定義
// =============================================================================

export interface PracticeMenuFormData {
  practiceDate?: string
  title?: string
  place?: string
  note?: string
  style?: string
  swimCategory?: 'Swim' | 'Pull' | 'Kick'
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
  reactionTime?: string // 反応時間（秒単位、0.40~1.00程度）
  splitTimes: Array<{
    distance: string | number
    splitTime: number
  }>
}

// 内部型（処理済み） - distanceはnumber
export interface RecordFormDataInternal {
  styleId: string
  time: number
  videoUrl?: string | null
  note?: string | null
  isRelaying: boolean
  reactionTime?: string // 反応時間（秒単位、0.40~1.00程度）
  splitTimes: Array<{
    distance: number
    splitTime: number
  }>
}

// 型変換関数
export const convertRecordFormData = (input: RecordFormDataInput): RecordFormDataInternal => {
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
  competitionId: string
  userId: string
  styleId: number
  entryTime: number | null
  note: string | null
  teamId?: string | null
  styleName?: string
}

