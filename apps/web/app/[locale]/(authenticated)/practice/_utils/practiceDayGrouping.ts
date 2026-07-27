import type { PracticeWithLogs } from "@apps/shared/types";
import type { PracticeSortColumn } from "@/stores/practice/practiceStore";
import type { SortValue } from "@/hooks/useTableSort";

/**
 * 練習履歴一覧の day-level 化(2026-07-23 Sprint)。
 *
 * usePracticesQuery は元々 practice 単位(1 practice.id = 1 練習日)で配列を返すため、
 * displayPractices をそのまま一覧のベースにできる。本ファイルはその前提のもとで
 * 「day-level の去重/フィルタ判定/ソート値抽出」の純関数のみを切り出し、単体テスト可能にする。
 */

/**
 * displayPractices を practice.id で去重する。
 * usePracticesQuery は通常 1 id = 1 要素で返すため恒等に近いが、リアルタイム更新等で
 * キャッシュに重複 id が混入するケースへの防御として明示的に去重する
 * (代表ログ=先頭ログの表示は呼び出し側の PracticeCard が practice_logs[0] を参照する)。
 */
export function groupLogsByPracticeDay(practices: PracticeWithLogs[]): PracticeWithLogs[] {
  const seenIds = new Set<string>();
  const result: PracticeWithLogs[] = [];

  for (const practice of practices) {
    if (seenIds.has(practice.id)) continue;
    seenIds.add(practice.id);
    result.push(practice);
  }

  return result;
}

/**
 * 指定した練習日(practice)の practice_logs の中に、選択した全タグを含むログが
 * 少なくとも1件存在するか判定する。
 *
 * - per-log: 選択した全タグを持つか(AND)
 * - 日全体: そのようなログが1件でも存在すれば true (OR-exists)
 * - 選択0件は常に true
 * - practice_logs が空の場合、選択1件以上なら false
 */
export function dayHasLogMatchingAllTags(
  practice: PracticeWithLogs,
  selectedTagIds: string[],
): boolean {
  if (selectedTagIds.length === 0) return true;

  const logs = practice.practice_logs || [];
  return logs.some((log) => {
    const logTagIds = (log.practice_log_tags || []).map((plt) => plt.practice_tag_id);
    return selectedTagIds.every((tagId) => logTagIds.includes(tagId));
  });
}

/**
 * 練習日(practice)カード一覧のソート値抽出(useTableSort 用)。
 *
 * day-level 化に伴い、ソート対象カラムは date/place の2列のみに縮小した
 * (distance/circle/style/avgTime は log 単位の値であり、1練習日に複数ログが
 * 混在し得る day-level カードでは一意に定まらないため対象から外した)。
 */
export function getPracticeDaySortValue(
  practice: PracticeWithLogs,
  column: PracticeSortColumn,
): SortValue {
  switch (column) {
    case "date": {
      const dateStr = practice.date || practice.created_at;
      return dateStr ? new Date(dateStr) : null;
    }
    case "place":
      return practice.place || null;
    default:
      return null;
  }
}
