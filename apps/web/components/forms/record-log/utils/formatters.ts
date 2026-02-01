// 共通ユーティリティからre-export
export { parseTime as parseTimeToSeconds } from '@apps/shared/utils/time'

/**
 * 秒数を表示用文字列にフォーマット
 */
export const formatSecondsToDisplay = (seconds?: number): string => {
  if (!seconds || seconds <= 0) return ''
  const minutes = Math.floor(seconds / 60)
  const remainder = (seconds % 60).toFixed(2).padStart(5, '0')
  return minutes > 0 ? `${minutes}:${remainder}` : remainder
}
