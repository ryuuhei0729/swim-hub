/**
 * 秒数を表示用文字列にフォーマット
 */
export const formatSecondsToDisplay = (seconds?: number): string => {
  if (!seconds || seconds <= 0) return ''
  const minutes = Math.floor(seconds / 60)
  const remainder = (seconds % 60).toFixed(2).padStart(5, '0')
  return minutes > 0 ? `${minutes}:${remainder}` : remainder
}

/**
 * 時間文字列を秒数にパース
 */
export const parseTimeToSeconds = (timeStr: string): number => {
  if (!timeStr || timeStr.trim() === '') return 0

  const parts = timeStr.split(':')
  if (parts.length === 2) {
    // 「分:秒.小数」形式
    const minutes = parseInt(parts[0]) || 0
    const seconds = parseFloat(parts[1]) || 0
    return minutes * 60 + seconds
  } else {
    // 秒数のみの形式
    return parseFloat(timeStr) || 0
  }
}
