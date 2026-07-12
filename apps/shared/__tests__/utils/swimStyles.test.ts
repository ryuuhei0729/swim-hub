// =============================================================================
// swimStyles.test.ts - 種目/距離マスター定数 共有ユーティリティのテスト
// =============================================================================
// Sprint Contract (タスク2: 種目定数の共有モジュール化) 検証観点:
//   [V-S1] STYLES が Option A の並び (自由形/平泳ぎ/背泳ぎ/バタフライ/個人メドレー) を維持する
//   [V-S2] DISTANCES が 50/100/200/400/800 の昇順を維持する
//   [V-S3] STYLE_KEY_MAP がフル型 (Partial ではない): STYLES の全要素にキーが存在し、
//          公式略称 (Fr/Br/Ba/Fly/IM) と一致する
//   [V-S4] isInvalidCombination が 5style × 5distance = 25通り全てで
//          既存5ファイルの実装と同じ真偽値を返す (無効: 個人メドレー50/800、
//          平泳ぎ/背泳ぎ/バタフライ400/800)
//   [V-S5] getDistancesForStyle が各種目の有効距離のみを昇順で返す
//
// 現時点で `apps/shared/utils/swimStyles.ts` は未実装 (Phase B で Developer が新設) のため、
// このテストは実装前は import 解決に失敗して全滅する。これは意図的な「検出器」であり、
// Developer 実装後に green になることを Sprint Contract の完了条件とする。
// =============================================================================

import { describe, expect, it } from "vitest";
import {
  DISTANCES,
  STYLES,
  STYLE_KEY_MAP,
  getDistancesForStyle,
  isInvalidCombination,
  type StyleTranslationKey,
} from "../../utils/swimStyles";

describe("STYLES / DISTANCES 定数", () => {
  it("[V-S1] STYLES は Option A の並び順", () => {
    expect(STYLES).toEqual(["自由形", "平泳ぎ", "背泳ぎ", "バタフライ", "個人メドレー"]);
  });

  it("[V-S2] DISTANCES は 50/100/200/400/800 の昇順", () => {
    expect(DISTANCES).toEqual([50, 100, 200, 400, 800]);
  });
});

describe("[V-S3] STYLE_KEY_MAP", () => {
  const expected: Record<string, StyleTranslationKey> = {
    自由形: "Fr",
    平泳ぎ: "Br",
    背泳ぎ: "Ba",
    バタフライ: "Fly",
    個人メドレー: "IM",
  };

  it.each(STYLES.map((style) => [style, expected[style]] as const))(
    "%s は公式略称 %s にマップされる",
    (style, key) => {
      expect(STYLE_KEY_MAP[style]).toBe(key);
    },
  );

  it("フル型であること: STYLES と STYLE_KEY_MAP のキー数が一致する (Partial からの強化を検出)", () => {
    expect(Object.keys(STYLE_KEY_MAP).sort()).toEqual([...STYLES].sort());
  });
});

describe("[V-S4] isInvalidCombination - 5style × 5distance 全25通り", () => {
  const INVALID_PAIRS = new Set<string>([
    "個人メドレー:50",
    "個人メドレー:800",
    "平泳ぎ:400",
    "平泳ぎ:800",
    "背泳ぎ:400",
    "背泳ぎ:800",
    "バタフライ:400",
    "バタフライ:800",
  ]);

  const allPairs = STYLES.flatMap((style) => DISTANCES.map((distance) => [style, distance] as const));

  it.each(allPairs)("%s × %im", (style, distance) => {
    const expectedInvalid = INVALID_PAIRS.has(`${style}:${distance}`);
    expect(isInvalidCombination(style, distance)).toBe(expectedInvalid);
  });

  it("自由形は無効な組み合わせを持たない (全距離で有効)", () => {
    for (const distance of DISTANCES) {
      expect(isInvalidCombination("自由形", distance)).toBe(false);
    }
  });

  it("無効組み合わせの総数は8通り", () => {
    const invalidCount = allPairs.filter(([style, distance]) =>
      isInvalidCombination(style, distance),
    ).length;
    expect(invalidCount).toBe(8);
  });
});

describe("[V-S5] getDistancesForStyle", () => {
  it("自由形は5距離すべてを昇順で返す", () => {
    expect(getDistancesForStyle("自由形")).toEqual([50, 100, 200, 400, 800]);
  });

  it.each(["平泳ぎ", "背泳ぎ", "バタフライ"] as const)(
    "%s は 50/100/200 のみ (400/800を除外)",
    (style) => {
      expect(getDistancesForStyle(style)).toEqual([50, 100, 200]);
    },
  );

  it("個人メドレーは 100/200/400 のみ (50/800を除外)", () => {
    expect(getDistancesForStyle("個人メドレー")).toEqual([100, 200, 400]);
  });

  it("戻り値は常に DISTANCES の部分集合かつ昇順", () => {
    for (const style of STYLES) {
      const result = getDistancesForStyle(style);
      const sorted = [...result].sort((a, b) => a - b);
      expect(result).toEqual(sorted);
      for (const d of result) {
        expect(DISTANCES).toContain(d);
      }
    }
  });
});
