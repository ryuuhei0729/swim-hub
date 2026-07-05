// =============================================================================
// 日付計算ユーティリティ - Swim Hub共通パッケージ
// =============================================================================

import { addMonths, endOfMonth, format, isValid, parseISO, startOfMonth } from "date-fns";
import { de, enUS, ja, ko, zhCN } from "date-fns/locale";
import type { Locale } from "date-fns";

// =============================================================================
// ロケール
// =============================================================================

/** サポートロケール (i18next の言語コードと一致) */
export type SupportedLocale = "ja" | "en" | "zh" | "ko" | "de";

/** date-fns Locale オブジェクトのマップ。zh は簡体字 (zh-CN) を採用。 */
const DATE_FNS_LOCALES: Record<SupportedLocale, Locale> = {
  ja,
  en: enUS,
  zh: zhCN,
  ko,
  de,
};

// =============================================================================
// 日付フォーマット共通関数
// =============================================================================

/** フォーマットスタイル */
export type DateStyle =
  | "iso"
  | "short"
  | "shortWithWeekday"
  | "long"
  | "longWithWeekday"
  | "longPadded"
  | "numeric"
  | "yearMonth";

const DATE_PATTERNS: Record<DateStyle, Record<SupportedLocale, string>> = {
  iso: { ja: "yyyy-MM-dd", en: "yyyy-MM-dd", zh: "yyyy-MM-dd", ko: "yyyy-MM-dd", de: "yyyy-MM-dd" },
  short: { ja: "M月d日", en: "MMM d", zh: "M月d日", ko: "M월 d일", de: "d. MMM" },
  shortWithWeekday: {
    ja: "M月d日(E)",
    en: "EEE, MMM d",
    zh: "M月d日(E)",
    ko: "M월 d일 (E)",
    de: "EEE, d. MMM",
  },
  long: {
    ja: "yyyy年M月d日",
    en: "MMM d, yyyy",
    zh: "yyyy年M月d日",
    ko: "yyyy년 M월 d일",
    de: "d. MMMM yyyy",
  },
  longWithWeekday: {
    ja: "yyyy年M月d日(E)",
    en: "EEE, MMM d, yyyy",
    zh: "yyyy年M月d日(E)",
    ko: "yyyy년 M월 d일 (E)",
    de: "EEE, d. MMMM yyyy",
  },
  longPadded: {
    ja: "yyyy年MM月dd日",
    en: "MMMM d, yyyy",
    zh: "yyyy年MM月dd日",
    ko: "yyyy년 MM월 dd일",
    de: "dd. MMMM yyyy",
  },
  numeric: { ja: "yyyy/MM/dd", en: "yyyy/MM/dd", zh: "yyyy/MM/dd", ko: "yyyy/MM/dd", de: "dd.MM.yyyy" },
  yearMonth: { ja: "yyyy年M月", en: "MMMM yyyy", zh: "yyyy年M月", ko: "yyyy년 M월", de: "MMMM yyyy" },
};

/**
 * 日付を指定されたスタイルでフォーマット
 * @param date 日付（文字列またはDate）
 * @param style フォーマットスタイル（デフォルト: 'short'）
 * @param locale ロケール（デフォルト: 'ja'）
 * @returns フォーマットされた日付文字列、無効な場合は '-'
 */
export function formatDate(
  date: string | Date | null | undefined,
  style: DateStyle = "short",
  locale: SupportedLocale = "ja",
): string {
  if (!date) return "-";

  const d = typeof date === "string" ? parseISO(date) : date;
  if (!isValid(d)) return "-";

  return format(d, DATE_PATTERNS[style][locale], { locale: DATE_FNS_LOCALES[locale] });
}

/**
 * 日付をISO形式（yyyy-MM-dd）に変換
 * @param date 日付
 * @returns ISO形式の日付文字列、無効な場合は空文字
 */
export function toISODateString(date: Date): string {
  if (!isValid(date)) return "";
  return format(date, "yyyy-MM-dd");
}

/**
 * 月を加算した新しいDateを返す（ミューテーションなし）
 */
export function addMonthsImmutable(date: Date, months: number): Date {
  return addMonths(date, months);
}

/** 日時フォーマットスタイル */
export type DateTimeStyle = "long" | "short" | "shortDate";

const DATETIME_PATTERNS: Record<DateTimeStyle, Record<SupportedLocale, string>> = {
  long: {
    ja: "yyyy年M月d日 HH:mm",
    en: "MMM d, yyyy HH:mm",
    zh: "yyyy年M月d日 HH:mm",
    ko: "yyyy년 M월 d일 HH:mm",
    de: "d. MMMM yyyy HH:mm",
  },
  short: { ja: "M/d HH:mm", en: "M/d HH:mm", zh: "M/d HH:mm", ko: "M/d HH:mm", de: "d.M. HH:mm" },
  shortDate: {
    ja: "M月d日 HH:mm",
    en: "MMM d HH:mm",
    zh: "M月d日 HH:mm",
    ko: "M월 d일 HH:mm",
    de: "d. MMM HH:mm",
  },
};

/**
 * 日時を指定されたスタイルでフォーマット（時刻含む）
 * @param date 日付（文字列またはDate）
 * @param style フォーマットスタイル（デフォルト: 'long'）
 * @param locale ロケール（デフォルト: 'ja'）
 * @returns フォーマットされた日時文字列、無効な場合は '-'
 */
export function formatDateTime(
  date: string | Date | null | undefined,
  style: DateTimeStyle = "long",
  locale: SupportedLocale = "ja",
): string {
  if (!date) return "-";

  const d = typeof date === "string" ? parseISO(date) : date;
  if (!isValid(d)) return "-";

  return format(d, DATETIME_PATTERNS[style][locale], { locale: DATE_FNS_LOCALES[locale] });
}

/**
 * 指定された年月の開始日と終了日を'yyyy-MM-dd'形式の文字列で返す
 * @param year 年
 * @param month 月（1-12）
 * @returns 開始日と終了日の文字列のタプル [startDateStr, endDateStr]
 */
export function getMonthDateRange(year: number, month: number): [string, string] {
  // 月の開始日を計算（year, month-1でDateオブジェクトを作成）
  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  // 月の終了日を計算
  const monthEnd = endOfMonth(new Date(year, month - 1, 1));

  // 'yyyy-MM-dd'形式にフォーマット
  const startDateStr = format(monthStart, "yyyy-MM-dd");
  const endDateStr = format(monthEnd, "yyyy-MM-dd");

  return [startDateStr, endDateStr];
}
