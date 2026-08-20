import { isCompetitionDateInPast } from "./date";

/**
 * 大会エントリー受付ステータス。
 */
export type EntryStatus = "before" | "open" | "closed";

/**
 * 大会日と DB 上の entry_status から、実際に表示すべきステータスを導出する。
 *
 * - 大会日が過去 (`isCompetitionDateInPast` が true) の場合、DB 値に関わらず
 *   常に "closed" を返す (表示派生。DB は書き換えない)。
 * - それ以外は DB の entry_status をそのまま返す (未指定なら "before" 既定)。
 *
 * @param date - 大会日 (ISO 8601 形式の日付文字列) または null/undefined
 * @param entryStatus - DB 上の entry_status または null/undefined
 */
export function resolveEntryStatus(
  date: string | null | undefined,
  entryStatus: EntryStatus | null | undefined,
): EntryStatus {
  if (isCompetitionDateInPast(date)) return "closed";
  return entryStatus ?? "before";
}
