// =============================================================================
// 日付計算ユーティリティ - Swim Hub共通パッケージ
// =============================================================================

import { endOfMonth, format, startOfMonth } from 'date-fns'

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

