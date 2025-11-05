// =============================================================================
// UI・フォーム関連型定義 - Swim Hub共通パッケージ
// =============================================================================

import { CalendarItemType, PracticeTag, PracticeLog, PracticeLogWithTimes, SplitTime, Record as RecordRow } from './database'

// =============================================================================
// 1. カレンダー関連
// =============================================================================

// =============================================================================
// メタデータ型定義
// =============================================================================

// チーム情報
export interface TeamInfo {
  id: string
  name: string
}

// 練習メタデータ
export interface PracticeMetadata {
    practice?: {
    id: string
    place: string
    practice_logs?: PracticeLog[]
  }
  practice_id?: string
  team_id?: string | null
  team?: TeamInfo
  user_id?: string
}

// 大会メタデータ
export interface CompetitionMetadata {
  competition?: {
    id: string
    title: string
    place: string | null
    pool_type: number
    team_id?: string | null
  }
  team_id?: string | null
  team?: TeamInfo
  pool_type?: number
}

// エントリーメタデータ
export interface EntryMetadata {
  entry?: {
    id: string
    competition_id: string
    user_id: string
    style_id: number
    entry_time?: number | null
    team_id?: string | null
  }
  competition?: {
    id: string
    title: string
    place: string | null
    pool_type: number
    team_id?: string | null
  }
  style?: {
    id: number
    name_jp: string
    distance: number
  }
  team_id?: string | null
  team?: TeamInfo
  entry_time?: number | null
}

// 記録メタデータ
export interface RecordMetadata {
  record?: {
    time: number
    time_result?: number
    is_relaying: boolean
    video_url?: string
    style: {
      id: string
      name_jp: string
      distance: number
    }
    competition_id?: string
    split_times?: SplitTime[]
  }
  competition?: {
    id: string
    title: string
    place: string | null
    pool_type: number
    team_id?: string | null
  }
  style?: {
    id: number
    name_jp: string
    distance: number
  }
  team_id?: string | null
  team?: TeamInfo
  pool_type?: number
}

// 統一されたカレンダーアイテム型
export interface CalendarItem {
  id: string
  type: CalendarItemType
  date: string
  title: string
  place?: string
  note?: string
  // メタデータ（型別の詳細情報）
  metadata: {
    // 練習関連
    practice?: {
      id?: string
      place: string
      practice_logs?: PracticeLog[]
    }
    practice_id?: string
    // 大会関連
    competition?: {
      id: string
      title: string
      place: string | null
      pool_type: number
      team_id?: string | null
    }
    // エントリー関連
    entry?: {
      id: string
      competition_id: string
      user_id: string
      style_id: number
      entry_time?: number | null
      team_id?: string | null
    }
    // 種目関連
    style?: {
      id: number
      name_jp: string
      distance: number
    }
    // 記録関連
    record?: {
      time: number
      time_result?: number
      is_relaying: boolean
      video_url?: string
      style: {
        id: string
        name_jp: string
        distance: number
      }
      competition_id?: string
      split_times?: SplitTime[]
    }
    // 共通フィールド
    team_id?: string | null
    team?: TeamInfo
    user_id?: string
    entry_time?: number | null
    pool_type?: number
  }
  // 編集時に必要な追加フィールド
  editData?: unknown
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

// エントリー情報（記録作成時）
export interface EntryInfo {
  styleId: number
  styleName: string
  entryTime?: number | null
}

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
  place: string
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
  editData?: {
    practiceId?: string
    logs?: PracticeLog[]
  } | null
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
  editData?: {
    recordId?: string
    splitTimes?: SplitTime[]
  } | null
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
  onEditPracticeLog?: (log: PracticeLogWithTimes & { tags?: PracticeTag[] }) => void
  onDeletePracticeLog?: (logId: string) => void
  onAddRecord?: (params: { competitionId?: string; entryData?: EntryInfo }) => void
  onEditRecord?: (record: RecordRow) => void
  onDeleteRecord?: (recordId: string) => void
  selectedDate?: Date | null
  isLoading?: boolean
  userId?: string
  openDayDetail?: Date | null
  currentDate?: Date
  onCurrentDateChange?: (date: Date) => void
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
  onEditPracticeLog?: (log: PracticeLogWithTimes & { tags?: PracticeTag[] }) => void
  onDeletePracticeLog?: (logId: string) => void
  onAddRecord?: (params: { competitionId?: string; entryData?: EntryInfo }) => void
  onEditRecord?: (record: RecordRow) => void
  onDeleteRecord?: (recordId: string) => void
}

// ダッシュボード統計
export interface DashboardStatsProps {
  monthlySummary?: MonthlySummary
  upcomingEvents?: CalendarItem[]
  isLoading?: boolean
}

// =============================================================================
// 4. デフォルト値
// =============================================================================

// =============================================================================
// 型ガード関数
// =============================================================================

// 練習メタデータの型ガード
export function isPracticeMetadata(metadata: unknown): metadata is { practice?: { id: string; place: string; practice_logs?: PracticeLog[] }; practice_id?: string; team_id?: string | null; team?: TeamInfo; user_id?: string } {
  if (!metadata || typeof metadata !== 'object') return false
  const m = metadata as Record<string, unknown>
  return 'practice' in m || 'practice_id' in m || 'team_id' in m || 'team' in m || 'user_id' in m
}

// 大会メタデータの型ガード
export function isCompetitionMetadata(metadata: unknown): metadata is { competition?: { id: string; title: string; place: string | null; pool_type: number; team_id?: string | null }; team_id?: string | null; team?: TeamInfo; pool_type?: number } {
  if (!metadata || typeof metadata !== 'object') return false
  const m = metadata as Record<string, unknown>
  return 'competition' in m || 'team_id' in m || 'team' in m || 'pool_type' in m
}

// エントリーメタデータの型ガード
export function isEntryMetadata(metadata: unknown): metadata is { entry?: { id: string; competition_id: string; user_id: string; style_id: number; entry_time?: number | null; team_id?: string | null }; competition?: { id: string; title: string; place: string | null; pool_type: number; team_id?: string | null }; style?: { id: number; name_jp: string; distance: number }; team_id?: string | null; team?: TeamInfo; entry_time?: number | null } {
  if (!metadata || typeof metadata !== 'object') return false
  const m = metadata as Record<string, unknown>
  return 'entry' in m || 'competition' in m || 'style' in m || 'team_id' in m || 'team' in m || 'entry_time' in m
}

// 記録メタデータの型ガード
export function isRecordMetadata(metadata: unknown): metadata is { record?: { time: number; time_result?: number; is_relaying: boolean; video_url?: string; style: { id: string; name_jp: string; distance: number }; competition_id?: string; split_times?: SplitTime[] }; competition?: { id: string; title: string; place: string | null; pool_type: number; team_id?: string | null }; style?: { id: number; name_jp: string; distance: number }; team_id?: string | null; team?: TeamInfo; pool_type?: number } {
  if (!metadata || typeof metadata !== 'object') return false
  const m = metadata as Record<string, unknown>
  return 'record' in m || 'competition' in m || 'style' in m || 'team_id' in m || 'team' in m || 'pool_type' in m
}

// チーム情報の型ガード
export function isTeamInfo(team: unknown): team is TeamInfo {
  return !!team && typeof (team as any).id === 'string' && typeof (team as any).name === 'string'
}

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

