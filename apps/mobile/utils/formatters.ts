/**
 * タイムフォーマット関数
 * 秒数を「分:秒.小数」形式に変換
 */
export const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = (seconds % 60).toFixed(2)
  return minutes > 0 ? `${minutes}:${remainingSeconds.padStart(5, '0')}` : remainingSeconds
}

/**
 * サークルタイムフォーマット関数
 * 秒数を「分'秒"」形式に変換（例: 125秒 → 2'05"）
 */
export const formatCircleTime = (seconds: number | null): string => {
  if (!seconds) return '-'
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${minutes}'${secs.toString().padStart(2, '0')}"`
}
