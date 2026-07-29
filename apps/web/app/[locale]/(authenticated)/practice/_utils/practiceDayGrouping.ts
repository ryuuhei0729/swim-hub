import type { PracticeLogWithTags, PracticeTag, PracticeWithLogs } from "@apps/shared/types";
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

/** サークルタイム(秒)を "1'30"" 形式にフォーマットする(mm'ss" 表記)。 */
export function formatCircleTime(circleSeconds: number): string {
  const minutes = Math.floor(circleSeconds / 60);
  const seconds = Math.floor(circleSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}'${seconds}"`;
}

/** 1件の練習ログを一覧カードの1行として表示するための情報 */
export interface PracticeLogLine {
  logId: string;
  secondLineInfo: string;
  tags: PracticeTag[];
}

/**
 * 練習日(practice)に紐づく practice_logs を、1ログ=1行として表示するための情報に変換する。
 *
 * 2026-07-23 Sprint で先頭ログ(firstLog)のみを表示していたのを、2026-07-28 のユーザー判断
 * (「1つの練習に複数の練習ログがあれば全部見せてほしい」)により全ログ展開に戻す一般化。
 * ログの並び順は practice_logs の配列順をそのまま用いる(取得元のクエリ順を尊重し、
 * ここで独自の並べ替えは行わない)。タグはログごと(practice_log_tags は log 単位の関連)。
 *
 * @param logs practice.practice_logs
 * @param getStyleLabel 種目コードをローカライズラベルに変換する関数(呼び出し側の t に依存するため注入)
 * @param formatDistance 距離×本数×セットの表示文字列を組み立てる関数(呼び出し側の t に依存するため注入)
 */
export function buildPracticeLogLines(
  logs: PracticeLogWithTags[] | undefined,
  getStyleLabel: (style: string) => string,
  formatDistance: (distance: number, reps: number, sets: number) => string,
): PracticeLogLine[] {
  if (!logs || logs.length === 0) return [];

  return logs.map((log) => {
    const parts: string[] = [];

    if (log.distance && log.rep_count && log.set_count) {
      parts.push(formatDistance(log.distance, log.rep_count, log.set_count));
    }
    if (log.circle) {
      parts.push(formatCircleTime(log.circle));
    }
    if (log.style) {
      parts.push(getStyleLabel(log.style));
    }

    const tags: PracticeTag[] =
      log.practice_log_tags
        ?.map((plt) => plt.practice_tags)
        .filter((tag): tag is NonNullable<typeof tag> => tag != null) ?? [];

    return {
      logId: log.id,
      secondLineInfo: parts.join(" / "),
      tags,
    };
  });
}
