// =============================================================================
// 共通型定義ファイル
// 水泳選手管理システム（個人利用版）の型定義を集約
// =============================================================================

import { Database } from '@/lib/supabase'

// =============================================================================
// 1. データベース型定義（Supabaseから継承）
// =============================================================================

// ユーザー関連
export type UserProfile = Database['public']['Tables']['users']['Row']
export type UserInsert = Database['public']['Tables']['users']['Insert']
export type UserUpdate = Database['public']['Tables']['users']['Update']

// 種目・泳法関連
export type Style = Database['public']['Tables']['styles']['Row']
export type StyleInsert = Database['public']['Tables']['styles']['Insert']
export type StyleUpdate = Database['public']['Tables']['styles']['Update']

// 大会関連
export type Competition = Database['public']['Tables']['competitions']['Row']
export type CompetitionInsert = Database['public']['Tables']['competitions']['Insert']
export type CompetitionUpdate = Database['public']['Tables']['competitions']['Update']

// 記録関連
export type Record = Database['public']['Tables']['records']['Row']
export type RecordInsert = Database['public']['Tables']['records']['Insert']
export type RecordUpdate = Database['public']['Tables']['records']['Update']

// スプリットタイム関連
export type SplitTime = Database['public']['Tables']['split_times']['Row']
export type SplitTimeInsert = Database['public']['Tables']['split_times']['Insert']
export type SplitTimeUpdate = Database['public']['Tables']['split_times']['Update']

// 練習関連
export type PracticeLog = Database['public']['Tables']['practice_logs']['Row']
export type PracticeLogInsert = Database['public']['Tables']['practice_logs']['Insert']
export type PracticeLogUpdate = Database['public']['Tables']['practice_logs']['Update']

export type PracticeTime = Database['public']['Tables']['practice_times']['Row']
export type PracticeTimeInsert = Database['public']['Tables']['practice_times']['Insert']
export type PracticeTimeUpdate = Database['public']['Tables']['practice_times']['Update']

// 練習タグ関連（カスタム型定義）
export interface PracticeTag {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
  updated_at: string
}

export interface PracticeTagInsert {
  id?: string
  user_id: string
  name: string
  color?: string
  created_at?: string
  updated_at?: string
}

export interface PracticeTagUpdate {
  id?: string
  user_id?: string
  name?: string
  color?: string
  created_at?: string
  updated_at?: string
}

// 練習ログタグ関連（カスタム型定義）
export interface PracticeLogTag {
  id: string
  practice_log_id: string
  practice_tag_id: string
  created_at: string
}

export interface PracticeLogTagInsert {
  id?: string
  practice_log_id: string
  practice_tag_id: string
  created_at?: string
}

export interface PracticeLogTagUpdate {
  id?: string
  practice_log_id?: string
  practice_tag_id?: string
  created_at?: string
}

// 練習（日単位）関連（カスタム型定義）
export interface Practice {
  id: string
  user_id: string
  date: string
  place: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export interface PracticeInsert {
  id?: string
  user_id: string
  date: string
  place?: string | null
  note?: string | null
  created_at?: string
  updated_at?: string
}

export interface PracticeUpdate {
  id?: string
  user_id?: string
  date?: string
  place?: string | null
  note?: string | null
  created_at?: string
  updated_at?: string
}

// =============================================================================
// 2. アプリケーション固有の型定義
// =============================================================================

// カレンダーアイテムタイプ
export type CalendarItemType = 'practice' | 'record'

// プール種別
export type PoolType = 0 | 1 // 0: 短水路, 1: 長水路

// 性別
export type Gender = 0 | 1 // 0: 男性, 1: 女性

// 泳法
export type SwimStyle = 'fr' | 'br' | 'ba' | 'fly' | 'im'

// =============================================================================
// 3. カレンダー関連の型定義
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
  style?: {
    id: string
    name_jp: string
    distance: number
  }
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

export interface CalendarData {
  year: number
  month: number
  days: CalendarDay[]
  summary: CalendarSummary
}

export interface MonthlySummary {
  practiceCount: number
  recordCount: number
  totalDistance?: number
  averageTime?: number
}

// =============================================================================
// 4. フォーム関連の型定義
// =============================================================================

// 練習ログフォーム
export interface PracticeSet {
  id: string
  reps: number | ''
  distance: number | ''
  circleTime: number | ''
  // UI用の分・秒入力（内部的にはcircleTime[秒]に正規化）
  uiCircleMin?: number | ''
  uiCircleSec?: number | ''
  setCount?: number | ''
  style: string
  note?: string
  tags?: PracticeTag[]
  times?: Array<{
    setNumber: number
    repNumber: number
    time: number
  }>
}

export interface PracticeLogFormData {
  practiceDate: string
  location: string
  sets: PracticeSet[]
  note: string
}

export interface PracticeLogFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit?: (data: PracticeLogFormData) => Promise<void>
  onDeletePracticeLog?: (practiceLogId: string) => Promise<void>
  initialDate?: Date
  editData?: any
  isLoading?: boolean
}

// 記録フォーム
export interface SplitTimeInput {
  distance: number
  splitTime: number
}

export interface RecordFormData {
  styleId: number
  time: number
  videoUrl?: string
  note?: string
  competitionId?: string
  isRelaying?: boolean
  splitTimes: SplitTimeInput[]
}

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
export interface TimeEntry {
  setNumber: number
  repNumber: number
  time: number
}

export interface TimeInputModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (times: TimeEntry[]) => void
  setCount: number
  repCount: number
  existingTimes?: TimeEntry[]
}

// 練習タイムフォーム
export interface PracticeTimeFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (times: TimeEntry[]) => void
  setCount: number
  repCount: number
  existingTimes?: TimeEntry[]
}

// =============================================================================
// 5. 認証関連の型定義
// =============================================================================

export interface AuthState {
  user: any | null
  profile: UserProfile | null
  session: any | null
  loading: boolean
}

export interface AuthContextType extends AuthState {
  supabase: any
  signIn: (email: string, password: string) => Promise<{ data: any; error: any }>
  signUp: (email: string, password: string, name?: string) => Promise<{ data: any; error: any }>
  signOut: () => Promise<{ error: any }>
  resetPassword: (email: string) => Promise<{ error: any }>
  updatePassword: (newPassword: string) => Promise<{ error: any }>
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error: any }>
  isAuthenticated: boolean
  isLoading: boolean
}

// =============================================================================
// 6. コンポーネント関連の型定義
// =============================================================================

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
}

// ダッシュボード統計
export interface DashboardStatsProps {
  monthlySummary?: MonthlySummary
  upcomingEvents?: any[]
  isLoading?: boolean
}

// =============================================================================
// 7. GraphQL関連の型定義
// =============================================================================

// GraphQLレスポンス型
export interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{
    message: string
    locations?: Array<{
      line: number
      column: number
    }>
    path?: string[]
  }>
}

// 楽観的更新用の型
export interface OptimisticUpdate {
  id: string
  optimisticId: string
  isOptimistic: boolean
  version: number
}

// =============================================================================
// 8. ユーティリティ型定義
// =============================================================================

// 部分的な型（一部のフィールドのみ更新可能）
export type PartialUpdate<T> = Partial<T>

// ID型
export type ID = string

// 日付型
export type DateString = string

// オプショナルな型
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

// 必須な型
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>

// =============================================================================
// 9. 定数定義
// =============================================================================

// 泳法の定数
export const SWIMMING_STYLES = [
  'Fr',
  'Ba', 
  'Br',
  'Fly',
  'IM'
] as const

// プール種別の定数
export const POOL_TYPES = {
  SHORT: 0 as const,
  LONG: 1 as const
} as const

// 性別の定数
export const GENDERS = {
  MALE: 0 as const,
  FEMALE: 1 as const
} as const

// カレンダーアイテムタイプの定数
export const CALENDAR_ITEM_TYPES = {
  PRACTICE: 'practice' as const,
  RECORD: 'record' as const
} as const

// =============================================================================
// 10. 型ガード関数
// =============================================================================

export const isCalendarItemType = (value: any): value is CalendarItemType => {
  return value === 'practice' || value === 'record'
}

export const isPoolType = (value: any): value is PoolType => {
  return value === 0 || value === 1
}

export const isGender = (value: any): value is Gender => {
  return value === 0 || value === 1
}

export const isSwimStyle = (value: any): value is SwimStyle => {
  return ['fr', 'br', 'ba', 'fly', 'im'].includes(value)
}

// =============================================================================
// 11. デフォルト値
// =============================================================================

export const DEFAULT_VALUES = {
  POOL_TYPE: POOL_TYPES.SHORT,
  GENDER: GENDERS.MALE,
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
