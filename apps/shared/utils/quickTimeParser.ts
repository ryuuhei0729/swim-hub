// =============================================================================
// クイックタイム入力パーサー - 高速タイム入力用
// =============================================================================

/**
 * クイック入力のコンテキスト（引き継ぎ用）
 */
export interface QuickTimeContext {
  minutes: number    // 前回の分（60秒以上の場合）
  tensDigit: number  // 前回の十の位
}

/**
 * クイック入力のパース結果
 */
export interface QuickTimeResult {
  time: number              // パース結果（秒）
  context: QuickTimeContext // 次回用コンテキスト
  displayValue: string      // 表示用文字列
}

/**
 * デフォルトのコンテキスト
 */
export const defaultQuickTimeContext: QuickTimeContext = {
  minutes: 0,
  tensDigit: 0
}

/**
 * クイック入力形式をパースする
 *
 * フォーマット例:
 * - "31-2"   → 31.20秒（十の位=3を記憶）
 * - "2-3"    → 32.30秒（prevContext.tensDigit=3の場合、十の位を引き継ぐ）
 * - "8-4"    → 38.40秒（十の位を引き継ぐ）
 * - "46-1"   → 46.10秒（2桁入力→十の位を更新）
 * - "1-05-3" → 65.30秒（分:秒-小数）
 * - "8-3"    → 68.30秒（prevContext.minutes=1, tensDigit=0の場合）
 * - "12-2"   → 72.20秒（2桁入力→十の位を更新、分は引き継ぐ）
 *
 * 区切り文字: 数字以外のすべての文字
 *
 * @param input - 入力文字列
 * @param prevContext - 前回のコンテキスト（引き継ぎ用）
 * @returns パース結果、またはクイック形式でない場合はnull
 */
export function parseQuickTime(
  input: string,
  prevContext?: QuickTimeContext
): QuickTimeResult | null {
  if (!input || input.trim() === '') {
    return null
  }

  const trimmed = input.trim()

  // 数字以外の文字を区切りとして分割
  const parts = trimmed.split(/[^0-9]+/).filter(Boolean)

  if (parts.length < 2 || parts.length > 3) {
    return null
  }

  const ctx = prevContext ?? defaultQuickTimeContext

  // 2パーツ: SS-ms 形式（60秒未満）または引き継ぎあり
  if (parts.length === 2) {
    return parseTwoPartFormat(parts[0], parts[1], ctx)
  }

  // 3パーツ: M-SS-ms 形式（60秒以上）
  if (parts.length === 3) {
    return parseThreePartFormat(parts[0], parts[1], parts[2])
  }

  return null
}

/**
 * 2パーツ形式をパース（SS-ms または 一の位-ms）
 */
function parseTwoPartFormat(
  secondsPart: string,
  msPart: string,
  ctx: QuickTimeContext
): QuickTimeResult | null {
  const msValue = parseInt(msPart, 10)
  if (isNaN(msValue)) return null

  // 小数部を正規化（1桁なら×10、2桁以上ならそのまま）
  const ms = msPart.length === 1 ? msValue * 10 : msValue
  const msDecimal = ms / 100

  let seconds: number
  let newTensDigit: number
  let newMinutes = ctx.minutes

  if (secondsPart.length === 1) {
    // 一の位のみ → 十の位と分を引き継ぐ
    const onesDigit = parseInt(secondsPart, 10)
    if (isNaN(onesDigit)) return null

    seconds = ctx.tensDigit * 10 + onesDigit
    newTensDigit = ctx.tensDigit
  } else {
    // 2桁以上の場合
    seconds = parseInt(secondsPart, 10)
    if (isNaN(seconds)) return null

    newTensDigit = Math.floor(seconds / 10) % 10

    // 前回が60秒以上だった場合（minutes > 0）、分を引き継ぐ
    // ただし、入力値が60以上の場合は新しい分を計算
    if (ctx.minutes > 0 && seconds < 60) {
      // 分を引き継ぐ（例: 12-2 で ctx.minutes=1 なら 1:12.20）
      // newMinutes は既に ctx.minutes がセットされている
    } else if (seconds >= 60) {
      // 60秒以上の入力は分を計算（例: 65-3 → 1:05.30）
      newMinutes = Math.floor(seconds / 60)
      seconds = seconds % 60
      newTensDigit = Math.floor(seconds / 10) % 10
    } else {
      // 前回が60秒未満で、入力も60秒未満の場合は分をリセット
      newMinutes = 0
    }
  }

  // 分を加算
  const totalSeconds = newMinutes * 60 + seconds + msDecimal

  return {
    time: totalSeconds,
    context: {
      minutes: newMinutes,
      tensDigit: newTensDigit
    },
    displayValue: formatQuickTime(totalSeconds)
  }
}

/**
 * 3パーツ形式をパース（M-SS-ms）
 */
function parseThreePartFormat(
  minutesPart: string,
  secondsPart: string,
  msPart: string
): QuickTimeResult | null {
  const minutes = parseInt(minutesPart, 10)
  const seconds = parseInt(secondsPart, 10)
  const msValue = parseInt(msPart, 10)

  if (isNaN(minutes) || isNaN(seconds) || isNaN(msValue)) {
    return null
  }

  // 小数部を正規化
  const ms = msPart.length === 1 ? msValue * 10 : msValue
  const msDecimal = ms / 100

  const totalSeconds = minutes * 60 + seconds + msDecimal
  const tensDigit = Math.floor(seconds / 10) % 10

  return {
    time: totalSeconds,
    context: {
      minutes,
      tensDigit
    },
    displayValue: formatQuickTime(totalSeconds)
  }
}

/**
 * 秒数を表示用文字列にフォーマット（小数第1位まで）
 */
function formatQuickTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '0.0'
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes > 0) {
    return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`
  }
  return seconds.toFixed(1)
}

/**
 * クイック入力形式かどうかを判定
 */
export function isQuickTimeFormat(input: string): boolean {
  if (!input || input.trim() === '') return false

  const trimmed = input.trim()
  const parts = trimmed.split(/[^0-9]+/).filter(Boolean)

  // 2〜3パーツで、すべて数字
  return (parts.length === 2 || parts.length === 3) &&
         parts.every(p => /^\d+$/.test(p))
}
