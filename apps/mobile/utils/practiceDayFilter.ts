// =============================================================================
// 練習一覧(PracticesScreen)の純フィルタ/ソートロジック
// =============================================================================
// UI から分離したテスト可能な純関数群。1件 = 1日(practice)単位のフィルタ/ソートを扱う。

import { parseISO, isValid } from "date-fns";
import type { PracticeWithLogs, SwimStyle } from "@swim-hub/shared/types";
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

/**
 * タグフィルタ: 「選択した全タグを含むログが、その日の practice_logs に
 * 少なくとも1件存在すれば一致」(per-log は AND、日全体は OR-exists)。
 * 選択0件は常に一致(全通過)。
 *
 * タグIDは JOIN 先の `practice_tags.id` ではなく、FK生カラムである
 * `practice_log_tags.practice_tag_id` を直接参照する(web `PracticeClient` と同じ
 * ソース。JOIN 結果に依存しないため、将来 practice_tags 側のJOINが欠落しても
 * タグ絞り込みは正しく機能する)。
 */
export function practiceMatchesTags(practice: PracticeWithLogs, selectedTagIds: string[]): boolean {
  if (selectedTagIds.length === 0) return true;

  const logs = practice.practice_logs ?? [];
  return logs.some((log) => {
    const logTagIds = (log.practice_log_tags ?? []).map((plt) => plt.practice_tag_id);
    return selectedTagIds.every((tagId) => logTagIds.includes(tagId));
  });
}

/** 場所フィルタ(複数選択, OR。practice.place との直接比較)。選択0件は常に一致 */
export function practiceMatchesPlaces(practice: PracticeWithLogs, selectedPlaces: string[]): boolean {
  if (selectedPlaces.length === 0) return true;
  return !!practice.place && selectedPlaces.includes(practice.place);
}

/**
 * 種目フィルタ(単一選択)。その日の practice_logs のいずれか1件の種目キーが
 * 一致すれば日全体を表示対象にする(ANY-log match)。選択なし("")は常に一致
 */
export function practiceMatchesStyle(practice: PracticeWithLogs, selectedStyle: string): boolean {
  if (!selectedStyle) return true;
  const logs = practice.practice_logs ?? [];
  return logs.some((log) => normalizeStyleCode(log.style) === selectedStyle);
}

export interface PracticeFilterValues {
  filterPlaces: string[];
  /** "" = すべて */
  filterStyle: string;
  selectedTagIds: string[];
}

/** グループ間 AND で練習(日)を絞り込む */
export function filterPractices(
  practices: PracticeWithLogs[],
  filters: PracticeFilterValues,
): PracticeWithLogs[] {
  return practices.filter(
    (practice) =>
      practiceMatchesPlaces(practice, filters.filterPlaces) &&
      practiceMatchesStyle(practice, filters.filterStyle) &&
      practiceMatchesTags(practice, filters.selectedTagIds),
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
 */
export function sortPractices(
  practices: PracticeWithLogs[],
  sortColumn: PracticeSortColumn,
  sortOrder: PracticeSortOrder,
  locale?: string,
): PracticeWithLogs[] {
  if (!sortColumn) return practices;

  return [...practices].sort((a, b) => {
    if (sortColumn === "date") {
      return compareWithNullsLast(getPracticeSortDate(a), getPracticeSortDate(b), sortOrder);
    }
    return compareWithNullsLast(a.place || null, b.place || null, sortOrder, locale);
  });
}
