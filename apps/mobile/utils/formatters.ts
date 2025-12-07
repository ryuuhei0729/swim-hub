/**
 * タイムフォーマット関数
 * 秒数を「分:秒.小数」形式に変換
 */
export const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = (seconds % 60).toFixed(2)
  return minutes > 0 ? `${minutes}:${remainingSeconds.padStart(5, '0')}` : remainingSeconds
}
