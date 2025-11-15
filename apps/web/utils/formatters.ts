// 時間フォーマッター
export const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = (seconds % 60).toFixed(2)
  return minutes > 0 ? `${minutes}:${remainingSeconds.padStart(5, '0')}` : remainingSeconds
}

// 日付フォーマッター
export const formatDate = (date: string | Date, format: 'short' | 'long' | 'time' = 'short'): string => {
  const d = new Date(date)
  
  switch (format) {
    case 'short':
      return d.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    case 'long':
      return d.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      })
    case 'time':
      return d.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit'
      })
    default:
      return d.toLocaleDateString('ja-JP')
  }
}

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
