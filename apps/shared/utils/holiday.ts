import { format } from "date-fns";

/**
 * 日本の祝日を判定するユーティリティ
 * @holiday-jp/holiday_jp は React Native (Metro) の本番バンドルで
 * require("../package.json") が解決できずクラッシュするため、
 * 動的importで遅延読み込みする。
 */

let holidayData: Record<string, unknown> | null = null;
let loadFailed = false;

async function loadHolidayData(): Promise<Record<string, unknown> | null> {
  if (holidayData) return holidayData;
  if (loadFailed) return null;
  try {
    const mod = await import("@holiday-jp/holiday_jp/lib/holidays");
    holidayData = mod.default || mod;
    return holidayData;
  } catch {
    loadFailed = true;
    return null;
  }
}

// 起動時にバックグラウンドで読み込み開始
loadHolidayData();

/**
 * 指定された日付が日本の祝日かどうかを判定（同期版）
 * データ未読み込み時は false を返す（次回レンダリングで反映される）
 * @param date 判定する日付
 * @returns 祝日の場合はtrue、そうでなければfalse
 */
export function isHoliday(date: Date): boolean {
  if (!holidayData) return false;
  const dateStr = format(date, "yyyy-MM-dd");
  return dateStr in holidayData;
}
