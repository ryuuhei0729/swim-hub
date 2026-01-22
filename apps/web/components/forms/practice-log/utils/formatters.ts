/**
 * タイム表示のフォーマット関数
 */
export const formatTime = (seconds: number): string => {
  if (seconds === 0) return '0.00'
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return minutes > 0
    ? `${minutes}:${remainingSeconds.toFixed(2).padStart(5, '0')}`
    : `${remainingSeconds.toFixed(2)}`
}
