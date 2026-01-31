// =============================================================================
// タイム計算ユーティリティ - Swim Hub共通パッケージ
// =============================================================================

import { TimeEntry } from '../types/ui'

// 型を再エクスポート
export type { TimeEntry }

// タイム計算用の最小限の型（time フィールドのみ必須）
export type TimeEntryLike = Pick<TimeEntry, 'time'>

// =============================================================================
// タイム計算関数
// =============================================================================

export function calcFastest(times: TimeEntryLike[]): number | null {
  const valid = times.map(t => t.time).filter(t => typeof t === 'number' && t > 0)
  if (valid.length === 0) return null
  return Math.min(...valid)
}

export function calcAverage(times: TimeEntryLike[]): number | null {
  const valid = times.map(t => t.time).filter(t => typeof t === 'number' && t > 0)
  if (valid.length === 0) return null
  return valid.reduce((sum, t) => sum + t, 0) / valid.length
}

export function calcSum(times: TimeEntryLike[]): number {
  return times.map(t => t.time).filter(t => typeof t === 'number' && t > 0)
    .reduce((sum, t) => sum + t, 0)
}

// =============================================================================
// 時間フォーマット関数
// =============================================================================

/**
 * 秒数を "M:SS.m" 形式にフォーマット（小数第1位まで）
 *
 * @param seconds - 秒数（小数点以下はミリ秒）
 * @returns フォーマットされた時間文字列
 * @example formatTime(65.42) => "1:05.4"
 * @example formatTime(0) => "0.0"
 * @example formatTime(-1) => "0.0"
 */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0.0'
  }
  // 小数第1位で丸めてから分と秒を計算（59.99 → 60.0 → 1:00.0 のケースを正しく処理）
  const rounded = Math.round(seconds * 10) / 10
  const minutes = Math.floor(rounded / 60)
  const remainingSeconds = (rounded % 60).toFixed(1)
  return minutes > 0 ? `${minutes}:${remainingSeconds.padStart(4, '0')}` : remainingSeconds
}

/**
 * 秒数を短縮形式にフォーマット（空文字対応版、小数第1位まで）
 *
 * @param seconds - 秒数
 * @returns フォーマットされた時間文字列（0の場合は空文字）
 * @example formatTimeShort(65.42) => "1:05.4"
 * @example formatTimeShort(45.67) => "45.7"
 * @example formatTimeShort(0) => ""
 */
export function formatTimeShort(seconds: number): string {
  if (seconds === 0) return ''
  if (!Number.isFinite(seconds) || seconds < 0) return ''

  // 小数第1位で丸めてから分と秒を計算（59.99 → 60.0 → 1:00.0 のケースを正しく処理）
  const rounded = Math.round(seconds * 10) / 10
  const minutes = Math.floor(rounded / 60)
  const remainingSeconds = rounded % 60

  if (minutes > 0) {
    return `${minutes}:${remainingSeconds.toFixed(1).padStart(4, '0')}`
  }
  return remainingSeconds.toFixed(1)
}

/**
 * 秒数を "M:SS.m" 形式にフォーマット（常に分を表示、小数第1位まで）
 *
 * @param seconds - 秒数
 * @returns フォーマットされた時間文字列
 * @example formatTimeFull(45.67) => "0:45.7"
 * @example formatTimeFull(0) => "0:00.0"
 */
export function formatTimeFull(seconds: number): string {
  if (seconds === 0) return '0:00.0'
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.0'

  // 小数第1位で丸めてから分と秒を計算（59.99 → 60.0 → 1:00.0 のケースを正しく処理）
  const rounded = Math.round(seconds * 10) / 10
  const min = Math.floor(rounded / 60)
  const remainingSeconds = (rounded % 60).toFixed(1)

  return `${min}:${remainingSeconds.padStart(4, '0')}`
}

/**
 * 秒数を "M:SS.ms" 形式にフォーマット（平均値用、小数第2位まで）
 *
 * @param seconds - 秒数
 * @returns フォーマットされた時間文字列
 * @example formatTimeAverage(65.42) => "1:05.42"
 * @example formatTimeAverage(45.67) => "45.67"
 * @example formatTimeAverage(0) => "0.00"
 */
export function formatTimeAverage(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0.00'
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = (seconds % 60).toFixed(2)
  return minutes > 0 ? `${minutes}:${remainingSeconds.padStart(5, '0')}` : remainingSeconds
}

/**
 * 秒数を "M:SS.ms" 形式にフォーマット（ベストタイム/大会記録用、小数第2位まで）
 *
 * @param seconds - 秒数
 * @returns フォーマットされた時間文字列
 * @example formatTimeBest(65.42) => "1:05.42"
 * @example formatTimeBest(45.67) => "45.67"
 * @example formatTimeBest(0) => "0.00"
 * @example formatTimeBest(-1) => "0.00"
 */
export function formatTimeBest(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0.00'
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = (seconds % 60).toFixed(2)
  return minutes > 0 ? `${minutes}:${remainingSeconds.padStart(5, '0')}` : remainingSeconds
}

/**
 * 時間の差分をフォーマット
 *
 * @param time1 - 基準タイム（秒）
 * @param time2 - 比較タイム（秒）
 * @returns フォーマットされた差分文字列（+/-付き）
 * @example formatTimeDiff(65.42, 64.00) => "+1.42"
 */
export function formatTimeDiff(time1: number, time2: number): string {
  const diff = time1 - time2
  const sign = diff >= 0 ? '+' : ''
  return `${sign}${diff.toFixed(2)}`
}

// =============================================================================
// 時間パース関数
// =============================================================================

/**
 * 柔軟な形式の時間文字列を秒数に変換
 *
 * 従来形式（:と.を使用）:
 * - "1:23.45" → 83.45秒 (M:SS.ms)
 * - "1:30" → 90秒 (M:SS)
 * - "23.45" → 23.45秒 (SS.ms)
 *
 * クイック入力形式（-などの区切り）:
 * - "31-2" → 31.20秒 (SS-ms)
 * - "1-05-3" → 65.30秒 (M-SS-ms)
 *
 * @param timeString - 時間文字列
 * @returns 秒数（無効な場合は0）
 */
export function parseTime(timeString: string): number {
  if (!timeString || timeString.trim() === '') return 0

  const trimmed = timeString.trim()

  // 末尾の 's' を除去
  let cleaned = trimmed
  if (cleaned.endsWith('s') || cleaned.endsWith('S')) {
    cleaned = cleaned.slice(0, -1)
  }

  // 負の値チェック
  if (cleaned.startsWith('-')) return 0

  // 従来形式チェック（:と.と数字のみを使用している場合）
  if (/^[\d:.]+$/.test(cleaned)) {
    return parseTraditionalFormat(cleaned)
  }

  // クイック入力形式（その他の区切りを含む場合）
  return parseQuickFormat(cleaned)
}

/**
 * 従来形式をパース（:と.のみ）
 */
function parseTraditionalFormat(cleaned: string): number {
  // "M:SS.ms" or "M:SS" 形式
  if (cleaned.includes(':')) {
    const parts = cleaned.split(':')
    if (parts.length !== 2) return 0

    const minutes = parseInt(parts[0], 10)
    const seconds = parseFloat(parts[1])

    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return 0
    if (minutes < 0 || seconds < 0) return 0

    return minutes * 60 + seconds
  }

  // "SS.ms" 形式または純粋な秒数
  const result = parseFloat(cleaned)
  if (!Number.isFinite(result) || result < 0) return 0
  return result
}

/**
 * クイック入力形式をパース（任意の区切り文字）
 */
function parseQuickFormat(cleaned: string): number {
  // 数字以外を区切りとして分割
  const parts = cleaned.split(/[^0-9]+/).filter(Boolean)

  // 1パーツ: 秒のみ (例: "30")
  if (parts.length === 1) {
    const seconds = parseFloat(parts[0])
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : 0
  }

  // 2パーツ: SS-ms (例: "31-2" → 31.20秒)
  if (parts.length === 2) {
    const seconds = parseInt(parts[0], 10)
    const msValue = parseInt(parts[1], 10)
    // 小数部を正規化（1桁なら×10、2桁以上ならそのまま）
    const ms = parts[1].length === 1 ? msValue * 10 : msValue
    if (!Number.isFinite(seconds) || !Number.isFinite(ms)) return 0
    if (seconds < 0 || ms < 0) return 0
    return seconds + ms / 100
  }

  // 3パーツ: M-SS-ms (例: "1-05-3" → 65.30秒)
  if (parts.length === 3) {
    const minutes = parseInt(parts[0], 10)
    const seconds = parseInt(parts[1], 10)
    const msValue = parseInt(parts[2], 10)
    const ms = parts[2].length === 1 ? msValue * 10 : msValue
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || !Number.isFinite(ms)) return 0
    if (minutes < 0 || seconds < 0 || ms < 0) return 0
    return minutes * 60 + seconds + ms / 100
  }

  return 0
}

/**
 * 時間文字列を秒数に変換（nullを返すバージョン、バリデーション用）
 *
 * @param timeString - 時間文字列
 * @returns 秒数、または無効な場合はnull
 * @example parseTimeStrict("1:23.45") => 83.45
 * @example parseTimeStrict("invalid") => null
 */
export function parseTimeStrict(timeString: string): number | null {
  if (!timeString || timeString.trim() === '') return null

  const trimmed = timeString.trim()

  try {
    const parts = trimmed.split(':')
    // コロンが2つ以上ある場合は不正な形式
    if (parts.length > 2) return null

    if (parts.length === 2) {
      // "MM:SS.ms" 形式
      const minutes = parseInt(parts[0].trim(), 10)
      const seconds = parseFloat(parts[1].trim())

      if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null
      if (Number.isNaN(minutes) || Number.isNaN(seconds)) return null
      if (minutes < 0 || seconds < 0) return null

      return minutes * 60 + seconds
    } else {
      // "SS.ms" 形式
      const seconds = parseFloat(trimmed)

      if (!Number.isFinite(seconds) || Number.isNaN(seconds) || seconds < 0) {
        return null
      }

      return seconds
    }
  } catch {
    return null
  }
}

// =============================================================================
// ペース計算関数
// =============================================================================

/**
 * ペース計算（100mあたりのタイム）
 *
 * @param totalTime - 総タイム（秒）
 * @param distance - 距離（メートル）
 * @returns 100mあたりのタイム（秒）
 */
export function calculatePace(totalTime: number, distance: number): number {
  if (distance <= 0) return 0
  return (totalTime / distance) * 100
}


