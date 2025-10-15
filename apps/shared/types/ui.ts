// =============================================================================
// UI・フォーム関連型定義 - Swim Hub共通パッケージ
// =============================================================================

import { CalendarItemType, PoolType, PracticeTag } from './database'

// =============================================================================
// 1. カレンダー関連
// =============================================================================

export interface CalendarItem {
  id: string
  item_type: CalendarItemType
  item_date: string
  title: string
  location?: string
  time_result?: number
  pool_type?: PoolType
  tags?: string[]
  note?: string
  competition_name?: string
  is_relaying?: boolean
  team_practice?: boolean
  team_record?: boolean
  style?: {
    id: string
    name_jp: string
    distance: number
  }
  // Record型との互換性のための追加プロパティ
  user_id?: string
  competition_id?: string
  style_id?: number
  time?: number
  video_url?: string
  created_at?: string
  updated_at?: string
  split_times?: any[]
  competition?: {
    id: string
    title: string
    date: string
    place: string | null
    pool_type: number
  }
  // Practice型との互換性のための追加プロパティ
  practiceLogs?: any[]
  practice_logs?: any[]
}

export interface CalendarDay {
  date: Date
  hasPractice: boolean
  hasCompetition: boolean
  practiceCount: number
  recordCount: number
}

export interface CalendarSummary {
  totalPractices: number
  totalCompetitions: number
  totalRecords: number
}

export interface MonthlySummary {
  practiceCount: number
  recordCount: number
  totalDistance?: number
  averageTime?: number
}

// =============================================================================
// 2. フォーム関連
// =============================================================================

// 練習セット
export interface PracticeSet {
  id: string
  reps: number | ''
  distance: number | ''
  circleTime: number | ''
  uiCircleMin?: number | ''
  uiCircleSec?: number | ''
  setCount?: number | ''
  style: string
  note?: string
  tags?: PracticeTag[]
  times?: TimeEntry[]
}

// 練習ログフォームデータ
export interface PracticeLogFormData {
  practiceDate: string
  location: string
  sets: PracticeSet[]
  note: string
}

// タイム入力
export interface TimeEntry {
  setNumber: number
  repNumber: number
  time: number
}

// スプリットタイム入力
export interface SplitTimeInput {
  distance: number
  splitTime: number
}

// 記録フォームデータ
export interface RecordFormData {
  styleId: number
  time: number
  videoUrl?: string
  note?: string
  competitionId?: string
  isRelaying?: boolean
  splitTimes: SplitTimeInput[]
}

// =============================================================================
// 3. コンポーネントProps型定義
// =============================================================================

// 練習フォーム
export interface PracticeFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit?: (data: PracticeLogFormData) => Promise<void>
  onDeletePracticeLog?: (practiceLogId: string) => Promise<void>
  initialDate?: Date
  editData?: any
  isLoading?: boolean
  setAvailableTags?: (tags: PracticeTag[]) => void
}

// 記録フォーム
export interface RecordFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit?: (data: RecordFormData) => Promise<void>
  onDeleteRecord?: (recordId: string) => Promise<void>
  initialDate?: Date
  editData?: any
  isLoading?: boolean
}

// タイム入力モーダル
export interface TimeInputModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (times: TimeEntry[]) => void
  setCount: number
  repCount: number
  existingTimes?: TimeEntry[]
}

// カレンダーコンポーネント
export interface CalendarProps {
  entries?: CalendarItem[]
  onDateClick?: (date: Date) => void
  onAddItem?: (date: Date, type: CalendarItemType) => void
  onEditItem?: (item: CalendarItem) => void
  onDeleteItem?: (itemId: string, itemType: CalendarItemType) => void
  onAddPracticeLog?: (practiceId: string) => void
  onEditPracticeLog?: (log: any) => void
  onDeletePracticeLog?: (logId: string) => void
  onAddRecord?: (competitionId: string) => void
  onEditRecord?: (record: any) => void
  onDeleteRecord?: (recordId: string) => void
  selectedDate?: Date | null
  isLoading?: boolean
  userId?: string
  openDayDetail?: Date | null
}

// 日詳細モーダル
export interface DayDetailModalProps {
  isOpen: boolean
  onClose: () => void
  date: Date
  entries: CalendarItem[]
  onEditItem?: (item: CalendarItem) => void
  onDeleteItem?: (itemId: string, itemType: CalendarItemType) => void
  onAddItem?: (date: Date, type: CalendarItemType) => void
  onAddPracticeLog?: (practiceId: string) => void
  onEditPracticeLog?: (log: any) => void
  onDeletePracticeLog?: (logId: string) => void
  onAddRecord?: (competitionId: string) => void
  onEditRecord?: (record: any) => void
  onDeleteRecord?: (recordId: string) => void
}

// ダッシュボード統計
export interface DashboardStatsProps {
  monthlySummary?: MonthlySummary
  upcomingEvents?: any[]
  isLoading?: boolean
}

// =============================================================================
// 4. デフォルト値
// =============================================================================

export const DEFAULT_VALUES = {
  POOL_TYPE: 0 as const, // 短水路
  GENDER: 0 as const, // 男性
  PRACTICE_SET: {
    reps: 1,
    distance: 100,
    circleTime: 90,
    setCount: 1,
    style: 'Fr'
  },
  RECORD_FORM: {
    time: 0,
    splitTimes: []
  }
} as const

