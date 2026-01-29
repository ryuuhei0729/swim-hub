// =============================================================================
// 日付計算ユーティリティ - Swim Hub共通パッケージ
// =============================================================================

import { addMonths, endOfMonth, format, isValid, parseISO, startOfMonth } from 'date-fns'
import { ja } from 'date-fns/locale'

// =============================================================================
// 日付フォーマット共通関数
// =============================================================================

/** フォーマットスタイル */
export type DateStyle = 'iso' | 'short' | 'shortWithWeekday' | 'long' | 'longWithWeekday' | 'numeric'

const DATE_PATTERNS: Record<DateStyle, string> = {
  iso: 'yyyy-MM-dd',
  short: 'M月d日',
  shortWithWeekday: 'M月d日(E)',
  long: 'yyyy年M月d日',
  longWithWeekday: 'yyyy年M月d日(E)',
  numeric: 'yyyy/MM/dd',
}

/**
 * 日付を指定されたスタイルでフォーマット
 * @param date 日付（文字列またはDate）
 * @param style フォーマットスタイル（デフォルト: 'short'）
 * @returns フォーマットされた日付文字列、無効な場合は '-'
 */
export function formatDate(date: string | Date | null | undefined, style: DateStyle = 'short'): string {
  if (!date) return '-'

  const d = typeof date === 'string' ? parseISO(date) : date
  if (!isValid(d)) return '-'

  return format(d, DATE_PATTERNS[style], { locale: ja })
}

/**
 * 日付をISO形式（yyyy-MM-dd）に変換
 */
export function toISODateString(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/**
 * 月を加算した新しいDateを返す（ミューテーションなし）
 */
export function addMonthsImmutable(date: Date, months: number): Date {
  return addMonths(date, months)
}

/** 日時フォーマットスタイル */
export type DateTimeStyle = 'long' | 'short'

const DATETIME_PATTERNS: Record<DateTimeStyle, string> = {
  long: 'yyyy年M月d日 HH:mm',
  short: 'M/d HH:mm',
}

/**
 * 日時を指定されたスタイルでフォーマット（時刻含む）
 * @param date 日付（文字列またはDate）
 * @param style フォーマットスタイル（デフォルト: 'long'）
 * @returns フォーマットされた日時文字列、無効な場合は '-'
 */
export function formatDateTime(date: string | Date | null | undefined, style: DateTimeStyle = 'long'): string {
  if (!date) return '-'

  const d = typeof date === 'string' ? parseISO(date) : date
  if (!isValid(d)) return '-'

  return format(d, DATETIME_PATTERNS[style], { locale: ja })
}

/**
 * 指定された年月の開始日と終了日を'yyyy-MM-dd'形式の文字列で返す
 * @param year 年
 * @param month 月（1-12）
 * @returns 開始日と終了日の文字列のタプル [startDateStr, endDateStr]
 */
export function getMonthDateRange(year: number, month: number): [string, string] {
  // 月の開始日を計算（year, month-1でDateオブジェクトを作成）
  const monthStart = startOfMonth(new Date(year, month - 1, 1))
  // 月の終了日を計算
  const monthEnd = endOfMonth(new Date(year, month - 1, 1))
  
  // 'yyyy-MM-dd'形式にフォーマット
  const startDateStr = format(monthStart, 'yyyy-MM-dd')
  const endDateStr = format(monthEnd, 'yyyy-MM-dd')
  
  return [startDateStr, endDateStr]
}

