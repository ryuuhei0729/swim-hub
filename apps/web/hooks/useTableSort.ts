import { useCallback, useMemo } from "react";

/**
 * テーブルの3状態ソート(未ソート→昇順→降順→解除)を提供する汎用フック。
 *
 * `components/team/member-management/hooks/useMemberSort.ts` の3状態遷移パターンを、
 * 任意のカラムキー・任意のアイテム配列で再利用できるよう汎用化したもの。
 *
 * 状態(sortColumn/sortOrder)は呼び出し側(Zustandストア等)が保持し、このフックは
 * 「次の状態への遷移ロジック」と「メモ化されたソート結果」のみを提供する
 * (Zustand には生の状態のみを持たせ、比較・ソート処理はこのフックに閉じ込める)。
 */

export type SortOrder = "asc" | "desc";

/** ソート対象の単一値。number/string/Date 以外は localeCompare 相当の文字列比較にフォールバックする */
export type SortPrimitive = number | string | Date | null | undefined;

/**
 * ソート対象のカラム値。
 * 同一キー内でのタイブレークが必要な場合(例: 種目→距離、距離→本数→セット)は、
 * `number*係数+...` のような桁あふれのリスクがある合成をせず、
 * `[primary, secondary, ...]` の配列(タプル)として返すことで辞書式(lexicographic)に比較される。
 * null/undefined は「値なし」を表し、タプルのどの位置にあっても、また昇順・降順いずれでも
 * 常に末尾に固定される(sortOrder による符号反転の影響を受けない)。
 */
export type SortValue = SortPrimitive | SortPrimitive[];

export interface UseTableSortResult<T, C extends string> {
  /** ソート適用後の配列。sortColumn が null の場合は items をそのまま返す(元の順序を維持) */
  sortedItems: T[];
  /**
   * ヘッダークリック時に呼ぶハンドラ。3状態遷移:
   * - 未ソート or 別カラム → そのカラムを昇順で開始
   * - 同カラム・昇順中 → 降順へ
   * - 同カラム・降順中 → 解除(未ソートへ)
   */
  handleSort: (column: C) => void;
}

function isNilPrimitive(value: SortPrimitive): value is null | undefined {
  return value === null || value === undefined;
}

/** 非nil同士の raw 比較(asc方向)。sortOrder による符号反転は呼び出し側で行う */
function compareNonNilPrimitives(a: SortPrimitive, b: SortPrimitive, locale?: string): number {
  if (a instanceof Date || b instanceof Date) {
    const timeA = a instanceof Date ? a.getTime() : new Date(a as string).getTime();
    const timeB = b instanceof Date ? b.getTime() : new Date(b as string).getTime();
    return timeA - timeB;
  }

  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  return String(a).localeCompare(String(b), locale);
}

/**
 * SortValue(スカラーまたはタプル)を sortOrder を考慮して比較する。
 *
 * - タプルは辞書式(lexicographic)に評価する: 先頭要素から順に比較し、大小が決した時点で
 *   即座にその結果を返す(以降の要素=タイブレークキーは見ない)。ある位置で両要素が
 *   nil(タイ)の場合のみ次の位置に進む。
 * - null/undefined の要素は、タプル内のどの位置にあっても常に末尾に固定される
 *   (sortOrder="desc" であっても符号反転の対象にしない。反転するのは非nil同士の
 *   実際の大小比較結果のみ)。
 */
function compareSortValues(a: SortValue, b: SortValue, sortOrder: SortOrder, locale?: string): number {
  const arrA = Array.isArray(a) ? a : [a];
  const arrB = Array.isArray(b) ? b : [b];
  const length = Math.max(arrA.length, arrB.length);

  for (let i = 0; i < length; i++) {
    const elemA = arrA[i];
    const elemB = arrB[i];
    const aIsNil = isNilPrimitive(elemA);
    const bIsNil = isNilPrimitive(elemB);

    if (aIsNil && bIsNil) continue; // この位置はタイ → 次の位置(タイブレーク)で決着させる
    if (aIsNil) return 1; // null は常に末尾固定(sortOrder に関係なく反転しない)
    if (bIsNil) return -1;

    const comparison = compareNonNilPrimitives(elemA, elemB, locale);
    if (comparison !== 0) {
      return sortOrder === "asc" ? comparison : -comparison;
    }
    // comparison === 0 の場合はこの位置もタイ → 次の位置へ
  }

  return 0;
}

/**
 * @param items ソート対象の配列。sortColumn が null の場合はそのまま返す(呼び出し側で
 *              事前に決めたデフォルト順=例:日付降順を維持したまま渡すこと)
 * @param sortColumn 現在ソート中のカラムキー(状態はストア等の呼び出し側が保持)
 * @param sortOrder 現在のソート順(状態はストア等の呼び出し側が保持)
 * @param setSortColumn sortColumn 更新関数
 * @param setSortOrder sortOrder 更新関数
 * @param getSortValue アイテム・カラムキーからソート用の値(number/string/Date/null、または
 *                      タイブレーク用のタプル [primary, secondary, ...])を取り出す関数。
 *                      同一キー内でのタイブレークが必要な場合は、桁あふれのリスクがある
 *                      数値合成(例: styleIndex * 1000 + distance)ではなく、
 *                      タプル(例: [styleIndex, distance])を返すこと。
 * @param locale 文字列カラム比較(localeCompare)に使うロケール(例: useLocale() の戻り値)。
 *               省略時は実行環境のデフォルトロケールで比較する。
 */
export function useTableSort<T, C extends string>(
  items: T[],
  sortColumn: C | null,
  sortOrder: SortOrder,
  setSortColumn: (column: C | null) => void,
  setSortOrder: (order: SortOrder) => void,
  getSortValue: (item: T, column: C) => SortValue,
  locale?: string,
): UseTableSortResult<T, C> {
  const handleSort = useCallback(
    (column: C) => {
      if (sortColumn === column) {
        if (sortOrder === "asc") {
          setSortOrder("desc");
        } else {
          setSortColumn(null);
          setSortOrder("asc");
        }
      } else {
        setSortColumn(column);
        setSortOrder("asc");
      }
    },
    [sortColumn, sortOrder, setSortColumn, setSortOrder],
  );

  const sortedItems = useMemo(() => {
    if (!sortColumn) return items;

    const compare = (itemA: T, itemB: T): number => {
      const valueA = getSortValue(itemA, sortColumn);
      const valueB = getSortValue(itemB, sortColumn);
      return compareSortValues(valueA, valueB, sortOrder, locale);
    };

    return [...items].sort(compare);
  }, [items, sortColumn, sortOrder, getSortValue, locale]);

  return { sortedItems, handleSort };
}
