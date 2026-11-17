// =============================================================================
// 大会の日数 ⇄ 終了日の変換 - Swim Hub共通パッケージ
// 大会フォームは「開始日 + 日数」で入力し、DB には従来どおり end_date (単日なら null) で保存する。
// =============================================================================

import { addDays, differenceInCalendarDays, format, isValid, parseISO } from "date-fns";

export const MIN_COMPETITION_DAYS = 1;
export const MAX_COMPETITION_DAYS = 14;

const clampDays = (days: number): number =>
  Math.min(MAX_COMPETITION_DAYS, Math.max(MIN_COMPETITION_DAYS, Math.floor(days) || MIN_COMPETITION_DAYS));

/**
 * 開始日と終了日から開催日数を出す。終了日が空・不正・開始日より前なら 1 日。
 * 既存データが上限を超えていても実際の日数をそのまま返す (表示を変えないため)。
 */
export function competitionDaysFromRange(date: string, endDate: string | null | undefined): number {
  if (!endDate) return MIN_COMPETITION_DAYS;
  const start = parseISO(date);
  const end = parseISO(endDate);
  if (!isValid(start) || !isValid(end)) return MIN_COMPETITION_DAYS;
  const diff = differenceInCalendarDays(end, start);
  return diff < 0 ? MIN_COMPETITION_DAYS : diff + 1;
}

/**
 * 開始日と日数から終了日 (yyyy-MM-dd) を出す。単日 (1日) や開始日が不正なら空文字。
 * 日数は MIN〜MAX に収める。
 */
export function competitionEndDateFromDays(date: string, days: number): string {
  const d = clampDays(days);
  if (d <= 1) return "";
  const start = parseISO(date);
  if (!isValid(start)) return "";
  return format(addDays(start, d - 1), "yyyy-MM-dd");
}
