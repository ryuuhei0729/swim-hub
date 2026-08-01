/**
 * sortCompare パリティテスト (Sprint Contract Phase B 修正ループ再検証)
 *
 * [V-SH-03] mobile の `compareWithNullsLast`(apps/mobile/utils/sortCompare.ts)が、
 * web/shared の `compareSortValues`(apps/shared/hooks/useTableSort.ts)と
 * 同一セマンティクスであることを、**同一入力に対する出力(=ソート結果の順序)が一致する**
 * という観点で直接検証する。
 *
 * トートロジー防止メモ: 両実装の内部コード(if分岐の書き方等)を比較するのではなく、
 * 「同じ null 混じり配列を asc/desc それぞれで並べ替えたときの結果配列が完全に一致する」
 * という、Sprint Contract が要求する外部可観測な挙動のみをアサーションにする。
 * mobile はスカラー値(number/string/Date/null/undefined)のみを扱うため、
 * web 側もタプルではなくスカラー値の範囲でのみ比較する(mobile 側に無い機能=タプル比較は
 * このパリティ検証の対象外)。
 */

import { describe, expect, it } from "vitest";
import { compareSortValues, type SortOrder } from "@apps/shared/hooks/useTableSort";
import { compareWithNullsLast } from "../sortCompare";

const ORDERS: SortOrder[] = ["asc", "desc"];

describe("compareWithNullsLast (mobile) と compareSortValues (web/shared) のパリティ", () => {
  describe.each(ORDERS)("sortOrder=%s", (order) => {
    it("数値+null+undefined混じりの配列で、mobile/web が完全に同一の並び順になる", () => {
      const values: (number | null | undefined)[] = [30, null, 5, undefined, 100, 5, null, 0];

      const mobileSorted = [...values].sort((a, b) => compareWithNullsLast(a, b, order));
      const webSorted = [...values].sort((a, b) => compareSortValues(a, b, order));

      expect(mobileSorted).toEqual(webSorted);
    });

    it("文字列(場所名等)+null混じりの配列で、mobile/web が完全に同一の並び順になる", () => {
      const values: (string | null)[] = ["Bプール", null, "Aプール", "Cプール", null];

      const mobileSorted = [...values].sort((a, b) => compareWithNullsLast(a, b, order, "ja"));
      const webSorted = [...values].sort((a, b) => compareSortValues(a, b, order, "ja"));

      expect(mobileSorted).toEqual(webSorted);
    });

    it("Date+null混じりの配列で、mobile/web が完全に同一の並び順になる", () => {
      const values: (Date | null)[] = [
        new Date("2026-03-01"),
        null,
        new Date("2026-01-01"),
        new Date("2026-02-01"),
      ];

      const mobileSorted = [...values].sort((a, b) => compareWithNullsLast(a, b, order));
      const webSorted = [...values].sort((a, b) => compareSortValues(a, b, order));

      expect(mobileSorted).toEqual(webSorted);
    });

    it("全要素が null/undefined の配列でも、mobile/web ともクラッシュせず同一順序(元の順序維持)になる", () => {
      const values: (number | null | undefined)[] = [null, undefined, null];

      const mobileSorted = [...values].sort((a, b) => compareWithNullsLast(a, b, order));
      const webSorted = [...values].sort((a, b) => compareSortValues(a, b, order));

      expect(mobileSorted).toEqual(webSorted);
    });

    it("time=0 相当の falsy 数値(0)は通常の数値として扱われ、null とは異なる位置に来る(mobile/web一致)", () => {
      // このテスト自体は compareWithNullsLast/compareSortValues という比較関数レベルの検証であり、
      // 「0 を null 扱いする」防御的変換(record.time || null)は呼び出し側(recordFilter.ts)の
      // 責務であることの境界を明確にするため、0 はここでは通常値として比較されることを確認する。
      const values: (number | null)[] = [10, null, 0, 5];

      const mobileSorted = [...values].sort((a, b) => compareWithNullsLast(a, b, order));
      const webSorted = [...values].sort((a, b) => compareSortValues(a, b, order));

      expect(mobileSorted).toEqual(webSorted);
      expect(mobileSorted).toContain(0);
      expect(mobileSorted.indexOf(0)).not.toBe(mobileSorted.length - 1); // 0 は末尾固定されない(nullとは別)
    });
  });
});
