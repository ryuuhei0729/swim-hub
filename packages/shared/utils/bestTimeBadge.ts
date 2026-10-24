// =============================================================================
// ベストタイムのバッジ判定ユーティリティ - Swim Hub共通パッケージ
// Web/Mobile が共用する純粋関数 (一覧の BestTimeBadge / ベストタイム表の New バッジ)
// =============================================================================

import { differenceInDays, isValid, parseISO } from "date-fns";

import type { ListBestCandidates } from "../api/records";
import { formatTimeBest } from "./time";

/** 自己ベストと同記録とみなす許容誤差（秒）＝ web share/utils.ts BEST_EPSILON と同値 */
export const BEST_EPSILON = 0.005;

/** 一覧ベストバッジの状態（web/mobile 共用） */
export type BestBadgeState =
  | { kind: "first" }
  | { kind: "best"; label: string }
  | { kind: "slower"; label: string }
  | { kind: "none" };

/** 自己ベストとの差分を符号付きでフォーマット（改善=マイナス, 同記録=±0, 悪化=プラス） */
export function formatBestDelta(time: number, previousBest: number): string {
  const delta = time - previousBest;
  if (Math.abs(delta) <= BEST_EPSILON) return `Best±${formatTimeBest(0)}`;
  const sign = delta < 0 ? "-" : "+";
  return `Best${sign}${formatTimeBest(Math.abs(delta))}`;
}

/**
 * 一覧ベストバッジの状態を判定する純粋関数。
 * - isFirstRecord=true（previousBest が null）→ 初記録
 * - previousBest が数値かつ改善（同値含む: time - previousBest <= EPSILON）→ ベスト更新
 * - previousBest が数値かつ悪化（time - previousBest > EPSILON）→ ベストより遅い
 * - 判定不能（time <= 0 等）→ 非表示
 */
export function getBestBadgeState(
  time: number,
  previousBest: number | null | undefined,
  isFirstRecord: boolean,
): BestBadgeState {
  if (!Number.isFinite(time) || time <= 0) return { kind: "none" };
  if (isFirstRecord) return { kind: "first" };
  if (previousBest == null) return { kind: "none" };
  const label = formatBestDelta(time, previousBest);
  return time - previousBest <= BEST_EPSILON ? { kind: "best", label } : { kind: "slower", label };
}

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

// -----------------------------------------------------------------------------
// New バッジ (直近の記録を赤文字 + New バッジで強調) 判定
// -----------------------------------------------------------------------------

/** New バッジ / 赤文字の対象期間（日）。大会実施日からの経過日数で判定する */
export const NEW_RECORD_DAYS = 30;

/**
 * ベストタイムを「New」（New バッジ + 赤文字）として強調表示するかを判定する。
 *
 * 判定軸は **大会実施日 (competitions.date)**。記録行の作成日時 (created_at) ではないため、
 * 過去の大会の記録を今日入力しても New にはならない。
 * 一括登録は competition が無く引数が null/undefined になるため常に false（判定対象外）。
 * 未来日の大会は「大会日からまだ 30 日経っていない」状態なので New として扱う。
 */
export function isNewRecord(
  competitionDate: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!competitionDate) return false;
  const date = parseISO(competitionDate);
  if (!isValid(date)) return false;
  return differenceInDays(now, date) <= NEW_RECORD_DAYS;
}
