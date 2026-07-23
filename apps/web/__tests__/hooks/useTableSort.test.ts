/**
 * useTableSort テスト（実装 / Phase B・Critical 2 再検証で tuple 比較に修正）
 *
 * テスト対象: apps/web/hooks/useTableSort.ts
 *
 * Sprint Contract 検証観点（大会履歴・練習履歴タブのカラムソート機能）:
 *   [V-W-CSF-01/02/03] ヘッダークリック3状態: 未ソート→昇順→降順→解除
 *   [V-W-CSF-09] 別カラムのヘッダーをクリックすると、以前ソートしていたカラムの状態は
 *                リセットされ、新しいカラムが昇順から開始される（単一カラムのみソート可）
 *   [V-W-CSF-05/PSF-02/04/06] 値が null の行は昇順・降順いずれの場合も末尾固定
 *   [V-W-CSF-07] 種目カラムは STYLES 定義順（自由形→平泳ぎ→背泳ぎ→バタフライ→個人メドレー、
 *                同一種目内は距離昇順）でソートされる。name_jp のアルファベット順ではない
 *   [V-W-CSF-08] 記録(タイム)カラムは数値秒での比較（文字列比較ではない）
 *   [Critical 2 再検証] SortValue はタプル([primary, secondary, ...])を許容し、
 *                桁あふれのリスクがある数値合成(idx*1000+distance 等)をせずに
 *                辞書式(lexicographic)比較すること。旧実装の `idx*1000+distance` 方式は
 *                distance が 1000 を超える(自由形は 1500m まで存在する)と、桁が
 *                隣の stroke index の桁域を侵食して誤った順序になるバグを再現しない。
 *
 * NOTE: 以前の版ではこのファイル自身の getSortValue モックが `idx*1000+distance` という
 *       数値合成を使っており、本番の getCompetitionSortValue/getPracticeSortValue が実際に
 *       使うタプル([idx, distance])を経由していなかった(=SortValue の配列比較コードパスを
 *       一切検証できていなかった)。CompetitionClient/PracticeClient の getSortValue 実装に
 *       合わせてタプルを返すよう修正し、1500m の境界ケースを追加した。
 *
 * 参考実装: components/team/member-management/hooks/useMemberSort.ts
 *   （3状態の状態遷移パターンの前例）
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { useTableSort, type SortOrder, type SortValue } from "../../hooks/useTableSort";

type Column = "name" | "score" | "style" | "time" | "date";

interface Item {
  id: string;
  name: string;
  score: number | null;
  /** styles.name_jp の実データ形状 (距離接頭辞つき。例: "50m自由形"/"1500m自由形") */
  styleNameJp: string | null;
  time: number | null;
  date: Date | null;
}

/** apps/shared/utils/swimStyles.ts の STYLES と同じ定義順(テスト内で独立に持つ) */
const STYLES = ["自由形", "平泳ぎ", "背泳ぎ", "バタフライ", "個人メドレー"] as const;
const DISTANCE_PREFIX_PATTERN = /^\d+m/;

/** getStyleOrderIndex (apps/shared/utils/swimStyles.ts) と同じロジックをテスト内に再現 */
function getStyleIndex(nameJp: string): number {
  const withoutPrefix = nameJp.replace(DISTANCE_PREFIX_PATTERN, "");
  return STYLES.indexOf(withoutPrefix as (typeof STYLES)[number]);
}

function extractDistance(nameJp: string): number {
  const match = nameJp.match(/^(\d+)m/);
  return match ? Number(match[1]) : 0;
}

/** Zustand ストアの代わりに useState で sortColumn/sortOrder を保持するテストハーネス */
function useHarness(
  items: Item[],
  getSortValue: (item: Item, column: Column) => SortValue,
  locale?: string,
) {
  const [sortColumn, setSortColumn] = useState<Column | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const { sortedItems, handleSort } = useTableSort<Item, Column>(
    items,
    sortColumn,
    sortOrder,
    setSortColumn,
    setSortOrder,
    getSortValue,
    locale,
  );

  return { sortedItems, handleSort, sortColumn, sortOrder };
}

/**
 * 本番の getCompetitionSortValue (CompetitionClient.tsx) / getPracticeSortValue
 * (PracticeClient.tsx) と同じ方針: 種目カラムは [styleIndex, distance] のタプルを返す
 * (桁あふれのリスクがある数値合成はしない)。
 */
function getSortValue(item: Item, column: Column): SortValue {
  switch (column) {
    case "name":
      return item.name;
    case "score":
      return item.score;
    case "style": {
      if (!item.styleNameJp) return null;
      const idx = getStyleIndex(item.styleNameJp);
      if (idx === -1) return null;
      return [idx, extractDistance(item.styleNameJp)];
    }
    case "time":
      return item.time;
    case "date":
      return item.date;
    default:
      return null;
  }
}

function makeItem(overrides: Partial<Item> & { id: string }): Item {
  return {
    name: "",
    score: null,
    styleNameJp: null,
    time: null,
    date: null,
    ...overrides,
  };
}

describe("useTableSort", () => {
  describe("3状態遷移（単一カラム）", () => {
    it("未ソート状態で任意のカラムキーを渡すと、そのカラムで昇順ソートされる（1回目クリック）", () => {
      const items = [
        makeItem({ id: "a", score: 3 }),
        makeItem({ id: "b", score: 1 }),
        makeItem({ id: "c", score: 2 }),
      ];
      const { result } = renderHook(() => useHarness(items, getSortValue));

      act(() => result.current.handleSort("score"));

      expect(result.current.sortColumn).toBe("score");
      expect(result.current.sortOrder).toBe("asc");
      expect(result.current.sortedItems.map((i) => i.id)).toEqual(["b", "c", "a"]);
    });

    it("同一カラムキーを2回連続で渡すと、1回目=昇順 → 2回目=降順 に切り替わる（同一列2回クリックでdesc）", () => {
      const items = [
        makeItem({ id: "a", score: 3 }),
        makeItem({ id: "b", score: 1 }),
        makeItem({ id: "c", score: 2 }),
      ];
      const { result } = renderHook(() => useHarness(items, getSortValue));

      act(() => result.current.handleSort("score"));
      act(() => result.current.handleSort("score"));

      expect(result.current.sortColumn).toBe("score");
      expect(result.current.sortOrder).toBe("desc");
      expect(result.current.sortedItems.map((i) => i.id)).toEqual(["a", "c", "b"]);
    });

    it("同一カラムキーを3回連続で渡すと、3回目でソートが解除され、sortColumn/sortOrder が初期状態に戻る（3回クリックで解除）", () => {
      const items = [makeItem({ id: "a", score: 3 }), makeItem({ id: "b", score: 1 })];
      const { result } = renderHook(() => useHarness(items, getSortValue));

      act(() => result.current.handleSort("score"));
      act(() => result.current.handleSort("score"));
      act(() => result.current.handleSort("score"));

      expect(result.current.sortColumn).toBeNull();
      expect(result.current.sortOrder).toBe("asc");
    });

    it("ソート解除後の並び順は、ソート適用前の元の配列順序（渡された items の順序）と一致する", () => {
      const items = [
        makeItem({ id: "a", score: 3 }),
        makeItem({ id: "b", score: 1 }),
        makeItem({ id: "c", score: 2 }),
      ];
      const { result } = renderHook(() => useHarness(items, getSortValue));

      act(() => result.current.handleSort("score"));
      act(() => result.current.handleSort("score"));
      act(() => result.current.handleSort("score"));

      expect(result.current.sortedItems.map((i) => i.id)).toEqual(["a", "b", "c"]);
    });
  });

  describe("3状態遷移（別カラムへの切り替え）", () => {
    it("カラムAで降順ソート中に、別カラムBのヘッダーをクリックすると、カラムAの状態はリセットされ、カラムBが昇順から開始される（別列でリセットしasc）", () => {
      const items = [
        makeItem({ id: "a", score: 3, name: "b-item" }),
        makeItem({ id: "b", score: 1, name: "a-item" }),
        makeItem({ id: "c", score: 2, name: "c-item" }),
      ];
      const { result } = renderHook(() => useHarness(items, getSortValue));

      act(() => result.current.handleSort("score"));
      act(() => result.current.handleSort("score")); // score を降順に

      act(() => result.current.handleSort("name")); // 別カラムへ切替

      expect(result.current.sortColumn).toBe("name");
      expect(result.current.sortOrder).toBe("asc");
      expect(result.current.sortedItems.map((i) => i.id)).toEqual(["b", "a", "c"]);
    });

    it("カラム切り替え後、直前のカラムの sortOrder が新カラムに引き継がれない（常に asc から開始）", () => {
      const items = [makeItem({ id: "a", score: 3 }), makeItem({ id: "b", score: 1 })];
      const { result } = renderHook(() => useHarness(items, getSortValue));

      act(() => result.current.handleSort("score"));
      act(() => result.current.handleSort("score")); // desc

      act(() => result.current.handleSort("time"));

      expect(result.current.sortOrder).toBe("asc");
    });
  });

  describe("null 値の末尾固定", () => {
    it("昇順ソート時、比較値が null/undefined の行は常に配列の末尾に固定される", () => {
      const items = [
        makeItem({ id: "a", score: null }),
        makeItem({ id: "b", score: 2 }),
        makeItem({ id: "c", score: null }),
        makeItem({ id: "d", score: 1 }),
      ];
      const { result } = renderHook(() => useHarness(items, getSortValue));

      act(() => result.current.handleSort("score"));

      const order = result.current.sortedItems.map((i) => i.id);
      expect(order.slice(0, 2)).toEqual(["d", "b"]);
      expect(order.slice(2)).toEqual(["a", "c"]);
    });

    it("降順ソート時も、比較値が null/undefined の行は末尾に固定される（先頭に来ない）", () => {
      const items = [
        makeItem({ id: "a", score: null }),
        makeItem({ id: "b", score: 2 }),
        makeItem({ id: "c", score: null }),
        makeItem({ id: "d", score: 1 }),
      ];
      const { result } = renderHook(() => useHarness(items, getSortValue));

      act(() => result.current.handleSort("score"));
      act(() => result.current.handleSort("score")); // desc

      const order = result.current.sortedItems.map((i) => i.id);
      expect(order.slice(0, 2)).toEqual(["b", "d"]);
      expect(order.slice(2)).toEqual(["a", "c"]);
    });

    it("null 同士の行が複数ある場合、null 行同士の相対順序は安定している（元の順序を維持）", () => {
      const items = [
        makeItem({ id: "x1", score: null }),
        makeItem({ id: "b", score: 2 }),
        makeItem({ id: "x2", score: null }),
        makeItem({ id: "x3", score: null }),
      ];
      const { result } = renderHook(() => useHarness(items, getSortValue));

      act(() => result.current.handleSort("score"));

      const nullOrder = result.current.sortedItems
        .map((i) => i.id)
        .filter((id) => id.startsWith("x"));
      expect(nullOrder).toEqual(["x1", "x2", "x3"]);
    });
  });

  describe("種目カラムのソート順（STYLES 定義順・タプル比較 [styleIndex, distance]）", () => {
    it("種目カラムを昇順ソートすると、自由形→平泳ぎ→背泳ぎ→バタフライ→個人メドレーの STYLES 定義順に並ぶ（name_jp のアルファベット順ではない）", () => {
      const items = [
        makeItem({ id: "im", styleNameJp: "200m個人メドレー" }),
        makeItem({ id: "fly", styleNameJp: "100mバタフライ" }),
        makeItem({ id: "fr", styleNameJp: "100m自由形" }),
        makeItem({ id: "ba", styleNameJp: "100m背泳ぎ" }),
        makeItem({ id: "br", styleNameJp: "100m平泳ぎ" }),
      ];
      const { result } = renderHook(() => useHarness(items, getSortValue));

      act(() => result.current.handleSort("style"));

      expect(result.current.sortedItems.map((i) => i.id)).toEqual([
        "fr",
        "br",
        "ba",
        "fly",
        "im",
      ]);
    });

    it("同一種目内では距離昇順(タプルの第2要素)で並ぶ（例: 50m自由形 → 100m自由形 → 200m自由形）", () => {
      const items = [
        makeItem({ id: "fr200", styleNameJp: "200m自由形" }),
        makeItem({ id: "fr50", styleNameJp: "50m自由形" }),
        makeItem({ id: "fr100", styleNameJp: "100m自由形" }),
      ];
      const { result } = renderHook(() => useHarness(items, getSortValue));

      act(() => result.current.handleSort("style"));

      expect(result.current.sortedItems.map((i) => i.id)).toEqual(["fr50", "fr100", "fr200"]);
    });

    it(
      "[Critical 2 再検証] stroke 境界を跨ぐ実データ: 1500m自由形(自由形/distance=1500) は " +
        "100m平泳ぎ(平泳ぎ/distance=100) より前に来る。旧実装の idx*1000+distance 方式だと " +
        "自由形(idx=0)の 1500m は 0*1000+1500=1500 になり、平泳ぎ(idx=1)の 100m " +
        "(1*1000+100=1100) より大きくなってしまい誤って後ろに来る回帰を防ぐ",
      () => {
        const items = [
          makeItem({ id: "br-100", styleNameJp: "100m平泳ぎ" }),
          makeItem({ id: "fr-1500", styleNameJp: "1500m自由形" }),
        ];
        const { result } = renderHook(() => useHarness(items, getSortValue));

        act(() => result.current.handleSort("style"));

        expect(result.current.sortedItems.map((i) => i.id)).toEqual(["fr-1500", "br-100"]);
      },
    );

    it("種目カラムを降順ソートすると、STYLES 定義順の完全な逆順になる", () => {
      const items = [
        makeItem({ id: "im", styleNameJp: "200m個人メドレー" }),
        makeItem({ id: "fly", styleNameJp: "100mバタフライ" }),
        makeItem({ id: "fr", styleNameJp: "100m自由形" }),
        makeItem({ id: "ba", styleNameJp: "100m背泳ぎ" }),
        makeItem({ id: "br", styleNameJp: "100m平泳ぎ" }),
      ];
      const { result } = renderHook(() => useHarness(items, getSortValue));

      act(() => result.current.handleSort("style"));
      act(() => result.current.handleSort("style")); // desc

      expect(result.current.sortedItems.map((i) => i.id)).toEqual([
        "im",
        "fly",
        "ba",
        "br",
        "fr",
      ]);
    });

    it("種目が null (マップ外/未設定)の行は末尾固定される", () => {
      const items = [
        makeItem({ id: "unknown", styleNameJp: "謎の泳法" }),
        makeItem({ id: "fr", styleNameJp: "50m自由形" }),
      ];
      const { result } = renderHook(() => useHarness(items, getSortValue));

      act(() => result.current.handleSort("style"));

      expect(result.current.sortedItems.map((i) => i.id)).toEqual(["fr", "unknown"]);
    });
  });

  describe("記録(タイム)カラムのソート順（数値秒比較）", () => {
    it("タイムカラムを昇順ソートすると、秒数(number)としての比較で速い記録（数値が小さい）が上位に来る（表示用フォーマット文字列 '1:23.45' の文字列比較ではない）", () => {
      // 文字列比較だと "9.99" > "83.45" になってしまう(先頭文字 '9' > '8')が、
      // 数値比較なら 9.99 < 83.45 で 9.99 が上位に来ることを確認する
      const items = [makeItem({ id: "slow", time: 83.45 }), makeItem({ id: "fast", time: 9.99 })];
      const { result } = renderHook(() => useHarness(items, getSortValue));

      act(() => result.current.handleSort("time"));

      expect(result.current.sortedItems.map((i) => i.id)).toEqual(["fast", "slow"]);
    });

    it("タイムが同じ秒数の行が複数ある場合でも例外を投げず安定してソートされる", () => {
      const items = [
        makeItem({ id: "a", time: 60 }),
        makeItem({ id: "b", time: 60 }),
        makeItem({ id: "c", time: 30 }),
      ];
      const { result } = renderHook(() => useHarness(items, getSortValue));

      expect(() => act(() => result.current.handleSort("time"))).not.toThrow();
      expect(result.current.sortedItems.map((i) => i.id)).toEqual(["c", "a", "b"]);
    });

    it("記録(タイム)が未登録(null)の行は、昇順・降順いずれでも末尾固定される（無記録行の末尾固定）", () => {
      const items = [
        makeItem({ id: "none", time: null }),
        makeItem({ id: "has", time: 45.0 }),
      ];
      const { result } = renderHook(() => useHarness(items, getSortValue));

      act(() => result.current.handleSort("time"));
      expect(result.current.sortedItems.map((i) => i.id)).toEqual(["has", "none"]);

      act(() => result.current.handleSort("time")); // desc
      expect(result.current.sortedItems.map((i) => i.id)).toEqual(["has", "none"]);
    });
  });

  describe("汎用性（練習履歴タブでの再利用を想定した数値カラム・タプルによる複合ソート）", () => {
    it("距離・本数・セット等、[primary, secondary, tertiary] のタプルを返すカラムでも、数値合成せず辞書式に正しく比較される", () => {
      type DistanceColumn = "distanceTuple";
      interface RepItem {
        id: string;
        distance: number;
        repCount: number;
        setCount: number;
      }
      const repItems: RepItem[] = [
        { id: "a", distance: 100, repCount: 999, setCount: 9 }, // distance primary は 100
        { id: "b", distance: 101, repCount: 0, setCount: 0 }, // distance primary は 101
      ];
      const getRepSortValue = (item: RepItem, _column: DistanceColumn): SortValue => [
        item.distance,
        item.repCount,
        item.setCount,
      ];

      function useRepHarness(items: RepItem[]) {
        const [sortColumn, setSortColumn] = useState<DistanceColumn | null>(null);
        const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
        return useTableSort<RepItem, DistanceColumn>(
          items,
          sortColumn,
          sortOrder,
          setSortColumn,
          setSortOrder,
          getRepSortValue,
        );
      }

      const { result } = renderHook(() => useRepHarness(repItems));
      act(() => result.current.handleSort("distanceTuple"));

      // rep_count=999 という大きな値を持つ a でも、distance(100) が distance(101) より
      // 優先されて先に来る(数値合成 distance*1000+rep_count なら 100*1000+999=100999 は
      // たまたま 101*1000+0=101000 未満で壊れないが、rep_count がさらに大きい値
      // (例: 1000超)を取り得る場合は容易に逆転する。タプル比較なら常に distance が支配的)
      expect(result.current.sortedItems.map((i) => i.id)).toEqual(["a", "b"]);
    });

    it("日付カラムのソートは ISO 文字列ではなく Date 値としての時系列比較で行われる", () => {
      // 文字列比較だと "2026-01-02"(1月) と "2026-1-10"(表記揺れ)のような場合に破綻しうるが、
      // Date インスタンスとして渡すことで正しい時系列比較になることを確認する
      const items = [
        makeItem({ id: "later", date: new Date("2026-02-01") }),
        makeItem({ id: "earlier", date: new Date("2026-01-15") }),
        makeItem({ id: "latest", date: new Date("2026-03-01") }),
      ];
      const { result } = renderHook(() => useHarness(items, getSortValue));

      act(() => result.current.handleSort("date"));

      expect(result.current.sortedItems.map((i) => i.id)).toEqual([
        "earlier",
        "later",
        "latest",
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // [Warning 2 再検証] compareSortValues 書き換え(isNilPrimitive/compareNonNilPrimitives へ分離)
  // の回帰防止テスト。
  //
  // 前回の実装・テストは「タプルの先頭要素が null」または「スカラー値そのものが null」の
  // ケースしかカバーしておらず、「タプルの先頭以外(タイブレーク用のサブ要素)が null」という
  // 地雷が未検証だった。例えば大会記録の種目カラムで [styleIndex, distance] のうち
  // distance 側が欠損する状況(集計上ありえない値・防御的 null 等)を想定し、
  // A=[1, null] vs B=[1, 5] のようにタイブレーク要素だけが null の場合に、
  // asc/desc いずれでも null 側(A)が末尾固定されることを確認する。
  // ---------------------------------------------------------------------------
  describe("[Warning 2 再検証] タプルのサブ要素(先頭以外)が null の末尾固定", () => {
    type PairColumn = "pair";
    interface PairItem {
      id: string;
      primary: number;
      secondary: number | null;
    }
    const getPairSortValue = (item: PairItem, _column: PairColumn): SortValue => [
      item.primary,
      item.secondary,
    ];

    function usePairHarness(items: PairItem[]) {
      const [sortColumn, setSortColumn] = useState<PairColumn | null>(null);
      const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
      return useTableSort<PairItem, PairColumn>(
        items,
        sortColumn,
        sortOrder,
        setSortColumn,
        setSortOrder,
        getPairSortValue,
      );
    }

    it("先頭要素(primary)が同値でサブ要素(secondary)が null の行は、昇順ソートで末尾固定される", () => {
      // A=[1, null] vs B=[1, 5] : primary が同値(1)のためタイブレークで secondary を見る。
      // secondary が null 側(A)は、比較結果の符号反転(sortOrder)の影響を受けず常に末尾。
      const items: PairItem[] = [
        { id: "a", primary: 1, secondary: null },
        { id: "b", primary: 1, secondary: 5 },
      ];
      const { result } = renderHook(() => usePairHarness(items));

      act(() => result.current.handleSort("pair")); // asc

      expect(result.current.sortedItems.map((i) => i.id)).toEqual(["b", "a"]);
    });

    it(
      "先頭要素(primary)が同値でサブ要素(secondary)が null の行は、降順ソートでも" +
        "末尾固定される(sortOrder反転で先頭に来ない = Warning 2 の地雷そのもの)",
      () => {
        const items: PairItem[] = [
          { id: "a", primary: 1, secondary: null },
          { id: "b", primary: 1, secondary: 5 },
        ];
        const { result } = renderHook(() => usePairHarness(items));

        act(() => result.current.handleSort("pair")); // asc
        act(() => result.current.handleSort("pair")); // desc へ

        // secondary=null の a が、desc だからといって符号反転で先頭に来てはいけない
        expect(result.current.sortedItems.map((i) => i.id)).toEqual(["b", "a"]);
      },
    );

    it("複数行でサブ要素が null のケースが混在しても、null 側だけが常に末尾に集まる(asc)", () => {
      const items: PairItem[] = [
        { id: "a", primary: 1, secondary: null },
        { id: "b", primary: 1, secondary: 5 },
        { id: "c", primary: 2, secondary: null },
        { id: "d", primary: 2, secondary: 3 },
      ];
      const { result } = renderHook(() => usePairHarness(items));

      act(() => result.current.handleSort("pair")); // asc

      const ids = result.current.sortedItems.map((i) => i.id);
      // primary=1 のグループが先(b, a の順で a が後ろ)、primary=2 のグループが後(d, c の順で c が後ろ)
      expect(ids).toEqual(["b", "a", "d", "c"]);
    });

    it("[非退行] タプルの先頭要素そのものが null の行も、サブ要素null修正後も引き続き末尾固定される", () => {
      const items: PairItem[] = [
        { id: "a", primary: null as unknown as number, secondary: 1 },
        { id: "b", primary: 1, secondary: 1 },
      ];
      const { result } = renderHook(() => usePairHarness(items));

      act(() => result.current.handleSort("pair")); // asc
      expect(result.current.sortedItems.map((i) => i.id)).toEqual(["b", "a"]);

      act(() => result.current.handleSort("pair")); // desc
      expect(result.current.sortedItems.map((i) => i.id)).toEqual(["b", "a"]); // desc でも a は末尾のまま
    });

    it("[非退行] スカラー値そのものが null のケース(タプルではない単一値)も引き続き末尾固定される", () => {
      // 既存の "null 値の末尾固定" describe と同種だが、compareSortValues 書き換え後の
      // 単一値(非配列)経路も壊れていないことを明示的に再確認する
      const items = [
        makeItem({ id: "has-score", score: 42 }),
        makeItem({ id: "no-score", score: null }),
      ];
      const { result } = renderHook(() => useHarness(items, getSortValue));

      act(() => result.current.handleSort("score")); // asc
      expect(result.current.sortedItems.map((i) => i.id)).toEqual(["has-score", "no-score"]);

      act(() => result.current.handleSort("score")); // desc
      expect(result.current.sortedItems.map((i) => i.id)).toEqual(["has-score", "no-score"]);
    });
  });
});
