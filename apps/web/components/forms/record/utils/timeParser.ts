// 共通ユーティリティからre-export
export { parseTime as parseTimeString, formatTime as formatTimeDisplay } from '@apps/shared/utils/time'

/**
 * UUIDを生成（ブラウザ互換性考慮）
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto).randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}
