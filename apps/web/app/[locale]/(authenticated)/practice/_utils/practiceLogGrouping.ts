import type { PracticeLogWithTags, PracticeTag } from "@apps/shared/types";
import type { PracticeLogRow } from "@apps/shared/utils/practiceLogRows";
import type { PracticeSortColumn } from "@/stores/practice/practiceStore";
import type { SortValue } from "@/hooks/useTableSort";

/**
 * 練習履歴一覧の log-level 化(2026-08-01)。
 *
 * 一覧のカードは「1 practice_log = 1枚」(大会タブの CompetitionRecordCard と同じ粒度)。
 * 行の生成/タグ判定は web/mobile 共通の `@apps/shared/utils/practiceLogRows` に置き、
 * 本ファイルには web 固有のソート値抽出と表示文字列組み立てのみを残す。
 */

/**
 * 練習ログカード一覧のソート値抽出(useTableSort 用)。
 *
 * ソート対象カラムは date/place の2列のみ。どちらも親 practice のフィールドなので、
 * 同じ練習に属するログ同士は常にタイになり、安定ソートにより
 * `buildPracticeLogRows` が並べた順序(= practice_logs のクエリ順)のまま隣り合う。
 * (distance/circle/style/avgTime を対象にしないのは day-level 時代からの既存仕様を踏襲)
 */
export function getPracticeLogRowSortValue(
  row: PracticeLogRow,
  column: PracticeSortColumn,
): SortValue {
  const { practice } = row;
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

/** 1件の練習ログをカードの本文行として表示するための情報 */
export interface PracticeLogLine {
  secondLineInfo: string;
  tags: PracticeTag[];
}

/**
 * 1件の練習ログを、カード本文の1行として表示するための情報に変換する。
 *
 * 表示項目は mobile `apps/mobile/components/practices/PracticeItem.tsx` の logRow と同一
 * (距離×本数×セット / サークル / 種目 を " / " で連結し、タグはログ単位)。
 *
 * @param log 表示対象の練習ログ(ログ未登録の練習は null。この場合 null を返す)
 * @param getStyleLabel 種目コードをローカライズラベルに変換する関数(呼び出し側の t に依存するため注入)
 * @param formatDistance 距離×本数×セットの表示文字列を組み立てる関数(呼び出し側の t に依存するため注入)
 */
export function buildPracticeLogLine(
  log: PracticeLogWithTags | null | undefined,
  getStyleLabel: (style: string) => string,
  formatDistance: (distance: number, reps: number, sets: number) => string,
): PracticeLogLine | null {
  if (!log) return null;

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
    secondLineInfo: parts.join(" / "),
    tags,
  };
}
