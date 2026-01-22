import { formatTime } from '@/utils/formatters'

/**
 * タイム文字列を秒数に変換
 * @param timeString - 時間文字列 ("1:30.50", "30.50", "30.50s" など)
 * @returns 秒数（無効な場合は0）
 */
export function parseTimeString(timeString: string): number {
  if (!timeString) return 0

  // "1:30.50" 形式
  if (timeString.includes(':')) {
    const [minutes, seconds] = timeString.split(':')
    return parseInt(minutes) * 60 + parseFloat(seconds)
  }

  // "30.50s" 形式
  if (timeString.endsWith('s')) {
    return parseFloat(timeString.slice(0, -1))
  }

  // 数値のみ
  return parseFloat(timeString)
}

/**
 * 秒数を表示用にフォーマット
 * @param seconds - 秒数
 * @returns フォーマットされた時間文字列
 */
export function formatTimeDisplay(seconds: number): string {
  if (seconds === 0) return '0.00'
  return formatTime(seconds)
}

/**
 * UUIDを生成（ブラウザ互換性考慮）
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto).randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}
