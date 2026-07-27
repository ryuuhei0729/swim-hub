// =============================================================================
// null 末尾固定の比較ヘルパー
// =============================================================================
// web `apps/shared/hooks/useTableSort.ts` の compareSortValues と同一セマンティクス
// (null/undefined は asc/desc に関わらず常に末尾固定、非nil同士の比較結果のみを
// sortOrder に応じて反転する)を、mobile のスカラー値ソート(date/time/place)向けに
// 最小限だけ複製したもの。
//
// TODO: apps/shared/hooks/useTableSort.ts が compareSortValues (または同等の
// null-last 比較関数)を export するようになったら、mobile 側のこの複製は廃止し
// そちらに委譲する。現時点(2026-07-23)では shared 側は useTableSort フック本体
// (タプル対応の3状態ソート込み)のみを export しており、単体の比較関数は
// export されていないため、shared 編集禁止の制約下でこの最小ヘルパーを
// mobile 内に置いている。

export type SortOrder = "asc" | "desc";
export type SortComparable = number | string | Date | null | undefined;

function isNilComparable(value: SortComparable): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * null/undefined を asc/desc いずれの場合も常に末尾に固定して比較する。
 * 非nil同士は number は差分、Date は getTime 差分、string は localeCompare で比較し、
 * その比較結果のみ sortOrder に応じて反転する(null-last の固定自体は反転しない)。
 */
export function compareWithNullsLast(
  a: SortComparable,
  b: SortComparable,
  order: SortOrder,
  locale?: string,
): number {
  const aIsNil = isNilComparable(a);
  const bIsNil = isNilComparable(b);

  if (aIsNil && bIsNil) return 0;
  if (aIsNil) return 1;
  if (bIsNil) return -1;

  let comparison: number;
  if (a instanceof Date || b instanceof Date) {
    const timeA = a instanceof Date ? a.getTime() : new Date(a as string).getTime();
    const timeB = b instanceof Date ? b.getTime() : new Date(b as string).getTime();
    comparison = timeA - timeB;
  } else if (typeof a === "number" && typeof b === "number") {
    comparison = a - b;
  } else {
    comparison = String(a).localeCompare(String(b), locale);
  }

  return order === "asc" ? comparison : -comparison;
}
