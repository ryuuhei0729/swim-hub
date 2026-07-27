// =============================================================================
// 大会記録一覧(RecordsScreen)の純フィルタ/ソートロジック
// =============================================================================
// UI から分離したテスト可能な純関数群。record.style / record.competition が
// null(JOIN欠落等)でも例外を投げず、条件不一致として除外する。

import { parseISO, isValid } from "date-fns";
import type { RecordWithDetails, SwimStyle } from "@swim-hub/shared/types";
import { compareWithNullsLast } from "./sortCompare";

export type RecordSortBy = "date" | "time";
export type RecordSortOrder = "asc" | "desc";
export type RecordRelayFilterMode = "all" | "excludeRelay" | "onlyRelay";

export interface RecordFilterValues {
  filterDistances: string[];
  filterStyles: string[];
  filterCompetitionNames: string[];
  filterPlaces: string[];
  /** "" = すべて */
  filterPoolType: string;
  filterRelayMode: RecordRelayFilterMode;
}

/** 場所フィルタの「未設定」を表すセンチネル値(空文字) */
export const UNSET_PLACE_VALUE = "";

/** 種目(泳法)コードの表示順(自由形→平泳ぎ→背泳ぎ→バタフライ→個人メドレー) */
export const RECORD_STYLE_ORDER: SwimStyle[] = ["fr", "br", "ba", "fly", "im"];

function getRecordSortDate(record: RecordWithDetails): Date | null {
  const dateStr = record.competition?.date || record.created_at;
  if (!dateStr) return null;
  const parsed = parseISO(dateStr);
  return isValid(parsed) ? parsed : null;
}

/** 距離フィルタの選択肢(distinct, 昇順)。record.style が無い記録はスキップする */
export function getParticipatedDistances(records: RecordWithDetails[]): number[] {
  const distances = new Set<number>();
  records.forEach((record) => {
    const distance = record.style?.distance;
    if (typeof distance === "number") distances.add(distance);
  });
  return Array.from(distances).sort((a, b) => a - b);
}

/** 種目(泳法)フィルタの選択肢(distinct, 表示順)。record.style が無い記録はスキップする */
export function getParticipatedStyleCodes(records: RecordWithDetails[]): SwimStyle[] {
  const codes = new Set<SwimStyle>();
  records.forEach((record) => {
    const code = record.style?.style;
    if (code) codes.add(code);
  });
  return RECORD_STYLE_ORDER.filter((code) => codes.has(code));
}

/** 大会名フィルタの選択肢(distinct, locale順) */
export function getParticipatedCompetitionNames(
  records: RecordWithDetails[],
  locale?: string,
): string[] {
  const names = new Set<string>();
  records.forEach((record) => {
    const title = record.competition?.title;
    if (title) names.add(title);
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b, locale));
}

/** 場所フィルタの選択肢(distinct, locale順) + 未設定(大会はあるが place が null)行の有無 */
export function getParticipatedPlaces(
  records: RecordWithDetails[],
  locale?: string,
): { places: string[]; hasUnsetPlace: boolean } {
  const places = new Set<string>();
  let hasUnsetPlace = false;
  records.forEach((record) => {
    const place = record.competition?.place;
    if (place) {
      places.add(place);
    } else if (record.competition) {
      hasUnsetPlace = true;
    }
  });
  return {
    places: Array.from(places).sort((a, b) => a.localeCompare(b, locale)),
    hasUnsetPlace,
  };
}

/**
 * グループ間 AND・グループ内 OR で大会記録を絞り込む。
 * record.style / record.competition が null でも例外を投げず除外扱いにする。
 */
export function filterRecords(
  records: RecordWithDetails[],
  filters: RecordFilterValues,
): RecordWithDetails[] {
  const {
    filterDistances,
    filterStyles,
    filterCompetitionNames,
    filterPlaces,
    filterPoolType,
    filterRelayMode,
  } = filters;

  return records.filter((record) => {
    // 距離フィルタ(複数選択, OR。style が無い記録は除外)
    if (filterDistances.length > 0) {
      const distance = record.style?.distance;
      if (distance === undefined || distance === null || !filterDistances.includes(distance.toString())) {
        return false;
      }
    }

    // 種目(泳法)フィルタ(複数選択, OR。style が無い記録は除外)
    if (filterStyles.length > 0) {
      const styleCode = record.style?.style;
      if (!styleCode || !filterStyles.includes(styleCode)) {
        return false;
      }
    }

    // リレーフィルタ(単一選択: すべて/リレー除く/リレーのみ)
    if (filterRelayMode === "excludeRelay" && record.is_relaying) return false;
    if (filterRelayMode === "onlyRelay" && !record.is_relaying) return false;

    // プール種別フィルタ(単一選択)
    if (filterPoolType === "long" && record.pool_type !== 1) return false;
    if (filterPoolType === "short" && record.pool_type !== 0) return false;

    // 大会名フィルタ(複数選択, OR)
    if (filterCompetitionNames.length > 0) {
      const title = record.competition?.title || null;
      if (!title || !filterCompetitionNames.includes(title)) return false;
    }

    // 場所フィルタ(複数選択, OR。"" = 未設定(null)行を表すセンチネル値)
    if (filterPlaces.length > 0) {
      const place = record.competition?.place || null;
      const matchesUnset = place === null && filterPlaces.includes(UNSET_PLACE_VALUE);
      const matchesValue = place !== null && filterPlaces.includes(place);
      if (!matchesUnset && !matchesValue) return false;
    }

    return true;
  });
}

/** 有効な絞り込み条件(グループ単位)の数を数える */
export function countActiveRecordFilters(filters: RecordFilterValues): number {
  return [
    filters.filterDistances.length > 0,
    filters.filterStyles.length > 0,
    filters.filterPoolType !== "",
    filters.filterRelayMode !== "all",
    filters.filterCompetitionNames.length > 0,
    filters.filterPlaces.length > 0,
  ].filter(Boolean).length;
}

/**
 * date/time プリセットソート(既定は日付降順)。
 * date: 大会日(なければ記録の作成日時)。time: record.time は型上 number だが、
 * DB上は未登録行を defensive に "-" 表示している既存実装に合わせ、falsy(0含む)は
 * null 扱いにして末尾固定する(web `getCompetitionSortValue` と同じ扱い)。
 * null/undefined は asc/desc いずれでも常に末尾に固定する(`compareWithNullsLast`)。
 */
export function sortRecords(
  records: RecordWithDetails[],
  sortBy: RecordSortBy,
  sortOrder: RecordSortOrder,
): RecordWithDetails[] {
  return [...records].sort((a, b) => {
    if (sortBy === "date") {
      return compareWithNullsLast(getRecordSortDate(a), getRecordSortDate(b), sortOrder);
    }
    return compareWithNullsLast(a.time || null, b.time || null, sortOrder);
  });
}
