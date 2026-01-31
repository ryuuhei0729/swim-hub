// 時間関連は共通ユーティリティからre-export
export { formatTime, formatTimeAverage, formatTimeBest, parseTime as parseTimeToSeconds } from '@apps/shared/utils/time'

// 日付フォーマッターは共通ユーティリティからre-export
export { formatDate } from '@apps/shared/utils/date'
export type { DateStyle } from '@apps/shared/utils/date'

// 数値フォーマッター
export const formatNumber = (num: number, decimals: number = 0): string => {
  return num.toLocaleString('ja-JP', { 
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals 
  })
}

// パーセンテージフォーマッター
export const formatPercentage = (value: number, total: number): string => {
  if (total === 0) return '0%'
  const percentage = (value / total) * 100
  return `${percentage.toFixed(1)}%`
}

// 泳法の日本語表示
export const formatStroke = (stroke: string): string => {
  const strokeMap: Record<string, string> = {
    freestyle: '自由形',
    backstroke: '背泳ぎ',
    breaststroke: '平泳ぎ',
    butterfly: 'バタフライ',
    individual_medley: '個人メドレー'
  }
  return strokeMap[stroke] || stroke
}

// 役割の日本語表示（roleカラムが削除されたため、デフォルトで「メンバー」を返す）
export const formatRole = (): string => {
  return 'メンバー'
}

// 出席状況の日本語表示
export const formatAttendanceStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    present: '出席',
    absent: '欠席',
    late: '遅刻',
    excused: '公欠'
  }
  return statusMap[status] || status
}
