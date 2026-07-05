/**
 * タブモーダル用純粋ユーティリティ関数
 *
 * 制約: 外部副作用なし・純粋関数のみ。QA が単体テスト可能。
 */

import { parseISO, isValid } from "date-fns";

// =============================================================================
// isEntryTabVisible — エントリータブ表示判定
// =============================================================================

/**
 * 大会日付が未来のときのみ true を返す純粋関数。
 *
 * - 未来 (date > today) → true
 * - 今日・過去・null・undefined・空文字 → false
 *
 * @param date - ISO 8601 形式の日付文字列 (YYYY-MM-DD) または null/undefined
 */
export function isEntryTabVisible(date: string | null | undefined): boolean {
  if (!date) return false;
  const parsed = parseISO(date);
  if (!isValid(parsed)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return parsed > today;
}

// =============================================================================
// isDateTodayOrPast — 今日以前判定
// =============================================================================

/**
 * 日付が今日または過去かどうかを判定する純粋関数。
 *
 * @param date - ISO 8601 形式の日付文字列
 */
export function isDateTodayOrPast(date: string | null | undefined): boolean {
  if (!date) return false;
  const parsed = parseISO(date);
  if (!isValid(parsed)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return parsed <= today;
}
