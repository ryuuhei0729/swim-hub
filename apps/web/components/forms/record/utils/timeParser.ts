import { formatTime } from '@/utils/formatters'

/**
 * タイム文字列を秒数に変換
 * @param timeString - 時間文字列 ("1:30.50", "30.50", "30.50s" など)
 * @returns 秒数（無効な場合は0）
 */
export function parseTimeString(timeString: string): number {
  if (!timeString) return 0

  const trimmed = timeString.trim()
  if (!trimmed) return 0

  // "1:30.50" 形式
  if (trimmed.includes(':')) {
    const [minutesPart, secondsPart] = trimmed.split(':')
    const minutes = parseInt(minutesPart)
    const seconds = parseFloat(secondsPart)
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
      return 0
    }
    return minutes * 60 + seconds
  }

  // "30.50s" 形式
  if (trimmed.endsWith('s')) {
    const seconds = parseFloat(trimmed.slice(0, -1))
    if (!Number.isFinite(seconds)) {
      return 0
    }
    return seconds
  }

  // 数値のみ
  const result = parseFloat(trimmed)
  if (!Number.isFinite(result)) {
    return 0
  }
  return result
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
