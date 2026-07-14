// =============================================================================
// 一覧ベストバッジ判定ユーティリティ - Swim Hub共通パッケージ
// Web/Mobile の一覧 BestTimeBadge が共用する純粋関数
// =============================================================================

import type { ListBestCandidates } from "../api/records";

/**
 * YYYY-MM-DD 形式の日付を created_at 比較用に正規化する。
 * YYYY-MM-DD (10文字) は当日 00:00:00.000Z に拡張し、当日以前のみ対象とする。
 * ISO タイムスタンプの場合はそのまま返す。
 */
export function normalizeRecordDateForBulkComparison(recordDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) {
    return `${recordDate}T00:00:00.000Z`;
  }
  return recordDate;
}

/**
 * グループ単位で一括取得した候補 (RecordAPI.getListBestCandidates) から
 * 「recordDate 時点の過去ベスト」を求める純粋関数。per-record クエリ版と同一の判定:
 * - 自分自身 (recordId) を除外
 * - 大会記録は competitions.date < recordDate。PostgREST の
 *   `.lt("competition.date", recordDate)` は値を date 型へキャストして比較するため、
 *   日付部分 (YYYY-MM-DD) の文字列比較で再現する
 * - 一括登録は created_at < 正規化 recordDate (timestamptz 比較)
 * 候補なし = null（その時点で初記録）。
 */
export function computeListPreviousBest(
  candidates: ListBestCandidates,
  recordId: string,
  recordDate: string,
): number | null {
  const recordDay = recordDate.slice(0, 10);
  const normalizedMs = new Date(normalizeRecordDateForBulkComparison(recordDate)).getTime();

  let best: number | null = null;
  for (const row of candidates.competitionRows) {
    if (row.id === recordId || row.date >= recordDay) continue;
    if (best === null || row.time < best) best = row.time;
  }
  for (const row of candidates.bulkRows) {
    if (row.id === recordId || new Date(row.created_at).getTime() >= normalizedMs) continue;
    if (best === null || row.time < best) best = row.time;
  }
  return best;
}
