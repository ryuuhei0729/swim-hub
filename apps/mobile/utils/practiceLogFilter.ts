// =============================================================================
// 練習一覧(PracticesScreen)の純フィルタ/ソートロジック
// =============================================================================
// UI から分離したテスト可能な純関数群。
// 2026-08-01: 一覧の粒度を day-level(1 practice = 1カード)から log-level
// (1 practice_log = 1カード、大会タブと同じ粒度)へ変更したため、フィルタ/ソートも
// PracticeLogRow(= カード1枚)単位で行う。行の生成は共有の buildPracticeLogRows。

import { parseISO, isValid } from "date-fns";
import type { PracticeWithLogs, PracticeLogWithTags, SwimStyle } from "@swim-hub/shared/types";
import { logMatchesAllTags, type PracticeLogRow } from "@apps/shared/utils/practiceLogRows";
import { compareWithNullsLast } from "./sortCompare";

export type PracticeSortColumn = "date" | "place" | null;
export type PracticeSortOrder = "asc" | "desc";

/** 種目(泳法)コードの表示順(自由形→平泳ぎ→背泳ぎ→バタフライ→個人メドレー) */
const STYLE_ORDER: SwimStyle[] = ["fr", "br", "ba", "fly", "im"];

/**
 * PracticeLog.style ("Fr"/"fr"/"FR" 等、大文字小文字表記ゆれあり) を
 * 正規化した SwimStyle コードに変換する。一致しない場合は null。
 */
function normalizeStyleCode(style: string | null | undefined): SwimStyle | null {
  if (!style) return null;
  const lower = style.toLowerCase();
  return (STYLE_ORDER as readonly string[]).includes(lower) ? (lower as SwimStyle) : null;
}

/** 場所フィルタ(複数選択, OR。practice.place との直接比較)。選択0件は常に一致 */
export function practiceMatchesPlaces(practice: PracticeWithLogs, selectedPlaces: string[]): boolean {
  if (selectedPlaces.length === 0) return true;
  return !!practice.place && selectedPlaces.includes(practice.place);
}

/**
 * 種目フィルタ(単一選択)。カードが log 単位になったため、そのログ自身の種目キーが
 * 一致するかだけを見る(day-level 時代の ANY-log match は不要)。
 * 選択なし("")は常に一致。ログ未登録(log=null)の行は種目を持たないため不一致。
 */
export function logMatchesStyle(log: PracticeLogWithTags | null, selectedStyle: string): boolean {
  if (!selectedStyle) return true;
  if (!log) return false;
  return normalizeStyleCode(log.style) === selectedStyle;
}

export interface PracticeFilterValues {
  filterPlaces: string[];
  /** "" = すべて */
  filterStyle: string;
  selectedTagIds: string[];
}

/**
 * グループ間 AND でカード行を絞り込む。
 * 場所は親 practice、種目/タグはその行のログを見る。
 */
export function filterPracticeLogRows(
  rows: PracticeLogRow[],
  filters: PracticeFilterValues,
): PracticeLogRow[] {
  return rows.filter(
    (row) =>
      practiceMatchesPlaces(row.practice, filters.filterPlaces) &&
      logMatchesStyle(row.log, filters.filterStyle) &&
      logMatchesAllTags(row.log, filters.selectedTagIds),
  );
}

/** 有効な絞り込み条件(グループ単位)の数を数える */
export function countActivePracticeFilters(filters: PracticeFilterValues): number {
  return [
    filters.filterPlaces.length > 0,
    filters.filterStyle !== "",
    filters.selectedTagIds.length > 0,
  ].filter(Boolean).length;
}

/** 場所フィルタの選択肢(distinct, locale順。null/空は候補に含めない) */
export function getParticipatedPracticePlaces(
  practices: PracticeWithLogs[],
  locale?: string,
): string[] {
  const places = new Set<string>();
  practices.forEach((practice) => {
    if (practice.place) places.add(practice.place);
  });
  return Array.from(places).sort((a, b) => a.localeCompare(b, locale));
}

/** 種目フィルタの選択肢(distinct, 表示順) */
export function getParticipatedPracticeStyleCodes(practices: PracticeWithLogs[]): SwimStyle[] {
  const codes = new Set<SwimStyle>();
  practices.forEach((practice) => {
    (practice.practice_logs ?? []).forEach((log) => {
      const code = normalizeStyleCode(log.style);
      if (code) codes.add(code);
    });
  });
  return STYLE_ORDER.filter((code) => codes.has(code));
}

function getPracticeSortDate(practice: PracticeWithLogs): Date | null {
  const parsed = parseISO(practice.date);
  return isValid(parsed) ? parsed : null;
}

/**
 * date/place プリセットソート。sortColumn が null の場合は並び替えを行わず、
 * 呼び出し側が渡した順序(サーバー既定順=日付降順)をそのまま維持する。
 * 欠損値(日付パース失敗・place未設定)は asc/desc いずれでも常に末尾に固定する
 * (`compareWithNullsLast`。web `useTableSort` の null-last セマンティクスと同一)。
 *
 * ソートキーは date/place いずれも練習(親)単位のため、同一練習に属するログ同士は
 * 常にタイになる。Array.prototype.sort は安定ソートなので、同じ練習のログは
 * `buildPracticeLogRows` が並べた順序(= practice_logs のクエリ順)のまま隣り合う。
 */
export function sortPracticeLogRows(
  rows: PracticeLogRow[],
  sortColumn: PracticeSortColumn,
  sortOrder: PracticeSortOrder,
  locale?: string,
): PracticeLogRow[] {
  if (!sortColumn) return rows;

  return [...rows].sort((a, b) => {
    if (sortColumn === "date") {
      return compareWithNullsLast(
        getPracticeSortDate(a.practice),
        getPracticeSortDate(b.practice),
        sortOrder,
      );
    }
    return compareWithNullsLast(a.practice.place || null, b.practice.place || null, sortOrder, locale);
  });
}
