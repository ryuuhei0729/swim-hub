// =============================================================================
// 共通型定義 - Swim Hub
// すべてのドメインで使用される共通の型、定数、型ガード
// =============================================================================

// =============================================================================
// 1. 基本型定義
// =============================================================================

// プール種別
export type PoolType = 0 | 1 // 0: 短水路, 1: 長水路

// 性別
export type Gender = 0 | 1 // 0: 男性, 1: 女性

// 泳法
export type SwimStyle = 'fr' | 'br' | 'ba' | 'fly' | 'im'

// 出欠ステータス
export type AttendanceStatus = 'present' | 'absent' | 'other'
export type AttendanceStatusType = 'open' | 'closed'

// カレンダーアイテムタイプ
export type CalendarItemType =
  | 'practice'           // 個人練習
  | 'team_practice'     // チーム練習
  | 'practice_log'      // 練習ログ
  | 'competition'       // 個人大会
  | 'team_competition'  // チーム大会
  | 'entry'             // 大会エントリー（記録未登録）
  | 'record'            // 大会記録

// チームロール
export type TeamRole = 'admin' | 'user'

// メンバータイプ
export type MemberType = 'swimmer' | 'coach' | 'director' | 'manager'

// =============================================================================
// 2. 定数
// =============================================================================

export const POOL_TYPES = {
  SHORT: 0 as const,
  LONG: 1 as const
} as const

export const GENDERS = {
  MALE: 0 as const,
  FEMALE: 1 as const
} as const

export const SWIM_STYLES = ['Fr', 'Ba', 'Br', 'Fly', 'IM'] as const

// カレンダーアイテムタイプの定数（Single Source of Truth）
export const CALENDAR_ITEM_TYPES = [
  'practice',           // 個人練習
  'team_practice',     // チーム練習
  'practice_log',      // 練習ログ
  'competition',       // 個人大会
  'team_competition',  // チーム大会
  'entry',             // 大会エントリー（記録未登録）
  'record'            // 大会記録
] as const

// =============================================================================
// 3. 型ガード
// =============================================================================

export const isPoolType = (value: any): value is PoolType => {
  return value === 0 || value === 1
}

export const isGender = (value: any): value is Gender => {
  return value === 0 || value === 1
}

export const isSwimStyle = (value: any): value is SwimStyle => {
  return ['fr', 'br', 'ba', 'fly', 'im'].includes(value)
}

export const isCalendarItemType = (value: any): value is CalendarItemType => {
  return (CALENDAR_ITEM_TYPES as readonly string[]).includes(value)
}

export const isTeamRole = (value: any): value is TeamRole => {
  return value === 'admin' || value === 'user'
}

// =============================================================================
// 4. 共通インターフェース
// =============================================================================

// 種目（マスターデータ）
export interface Style {
  id: number
  name_jp: string
  name: string
  style: SwimStyle
  distance: number
}

// タイムスタンプフィールド（共通）
export interface TimestampFields {
  created_at: string
  updated_at: string
}

// ベースエンティティ（ID + タイムスタンプ）
export interface BaseEntity extends TimestampFields {
  id: string
}

// =============================================================================
// 5. ユーティリティ型
// =============================================================================

export type ID = string
export type DateString = string

// 特定のフィールドをオプショナルにする
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

// 特定のフィールドを必須にする
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>
