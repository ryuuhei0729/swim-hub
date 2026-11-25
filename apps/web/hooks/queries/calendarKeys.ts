// =============================================================================
// ダッシュボードのカレンダー (月ごとのエントリー + 月間サマリー) のクエリキーと取得関数
// Server Component (DashboardDataLoader) からも使うため "use client" を付けない。
// フックは ./calendarQueries.ts に置く。
// =============================================================================
//
// - キーは表示月 ("yyyy-MM") だけで決まる。取得範囲 (グリッドの可視範囲) と月間サマリーの
//   年月は月から一意に計算するので、キーに含めるのは月だけで十分。
// - サーバー (DashboardDataLoader) と同じキー・同じ取得関数を使い、HydrationBoundary で
//   初期表示の月を引き継ぐ。ユーザー ID はキーに含めない (他のキーと同じく、ログアウト時に
//   AuthProvider がキャッシュ全体を clear する。クライアントでは user が最初 null なので、
//   含めると SSR と CSR でキーがずれてハイドレートしたデータが使われなくなる)。

import { addMonths, format, subMonths } from "date-fns";
import type { DashboardAPI } from "@apps/shared/api/dashboard";
import type { CalendarItem, MonthlySummary } from "@apps/shared/types/ui";
import { getCalendarGridRange } from "@/app/[locale]/(authenticated)/dashboard/_utils/calendarGridRange";

export interface CalendarMonthData {
  calendarItems: CalendarItem[];
  monthlySummary: MonthlySummary;
}

export const calendarKeys = {
  all: ["dashboardCalendar"] as const,
  /** month は "yyyy-MM" */
  month: (month: string) => [...calendarKeys.all, "month", month] as const,
} as const;

/**
 * マウント時に取り直さない猶予。サーバーで取得してハイドレートした直後のデータを
 * マウント直後にもう一度取りに行かないためのもの。これより古ければ (クライアントの
 * ルーターキャッシュで古い RSC ペイロードが再利用された場合など) マウント時に取り直す。
 */
export const CALENDAR_REFETCH_ON_MOUNT_GRACE_MS = 10 * 1000;

/**
 * 前後の月の先読みを「取得済み」とみなす時間。先読みは表示中の月を読み込むたびに走るので、
 * この時間内に取得済みの月は取り直さない (表示に切り替えた時点で改めて取り直す)。
 */
export const CALENDAR_PREFETCH_STALE_MS = 60 * 1000;

/** Date → 月キー ("yyyy-MM")。ローカル時刻の年月で決める */
export function toCalendarMonthKey(date: Date): string {
  return format(date, "yyyy-MM");
}

/** 月キー ("yyyy-MM") → その月の1日 (ローカル時刻) */
export function calendarMonthKeyToDate(month: string): Date {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year ?? 1970, (monthNumber ?? 1) - 1, 1);
}

/** 前後の月キー */
export function getAdjacentCalendarMonthKeys(month: string): { prev: string; next: string } {
  const date = calendarMonthKeyToDate(month);
  return {
    prev: toCalendarMonthKey(subMonths(date, 1)),
    next: toCalendarMonthKey(addMonths(date, 1)),
  };
}

/**
 * 指定月のカレンダーデータを取得する (サーバー・クライアント共通)。
 * グリッドの可視範囲 (日曜起点、前月末〜翌月初を含む) のエントリーと、その月の月間サマリー。
 * 失敗時は例外をそのまま投げる (空データを成功としてキャッシュしない)。
 */
export async function fetchCalendarMonth(
  api: DashboardAPI,
  month: string,
): Promise<CalendarMonthData> {
  const monthDate = calendarMonthKeyToDate(month);
  const { startDate, endDate } = getCalendarGridRange(monthDate);
  const [calendarItems, monthlySummary] = await Promise.all([
    api.getCalendarEntries(startDate, endDate),
    api.getMonthlySummary(monthDate.getFullYear(), monthDate.getMonth() + 1),
  ]);
  return { calendarItems, monthlySummary };
}

/** 最終取得からの経過がマウント時の猶予を超えていれば取り直す */
export function shouldRefetchCalendarOnMount(query: { state: { dataUpdatedAt: number } }): boolean {
  return Date.now() - query.state.dataUpdatedAt > CALENDAR_REFETCH_ON_MOUNT_GRACE_MS;
}

/**
 * カレンダー1か月分のクエリ設定。
 * - staleTime 0: 月を切り替えるたびに取り直していた従来の鮮度を保つ (キャッシュ済みの月は
 *   その内容を先に表示し、裏で取り直す)
 * - retry false: 従来どおり失敗したらすぐエラー表示にする (既定の3回リトライで待たせない)
 */
export function calendarMonthQueryOptions(api: DashboardAPI, month: string) {
  return {
    queryKey: calendarKeys.month(month),
    queryFn: () => fetchCalendarMonth(api, month),
    staleTime: 0,
    retry: false,
    refetchOnMount: shouldRefetchCalendarOnMount,
  } as const;
}

