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
  formatStyleAbbrev,
  getDistancesForStyle,
  getStyleOrderIndex,
  isInvalidCombination,
  toStyleCode,
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

// ---------------------------------------------------------------------------
// getStyleOrderIndex - 種目カラムのソート用インデックス取得
//
// Sprint Contract 検証観点（大会履歴/練習履歴のソート機能・Critical 1 再検証）:
//   [V-W-CSF-07] 種目カラムは STYLES 定義順（自由形→平泳ぎ→背泳ぎ→バタフライ→個人メドレー）でソートされる
//
// Reviewer が前回指摘した「実データ形状」テストの欠落: styles.name_jp の実データは
// DBシード(supabase/migrations/20251201014342_initial_schema.sql)上、
// "25m自由形"〜"1500m自由形" のように **距離接頭辞つき** で格納されている
// (自由形のみ 1500m まで存在し、他4種目は 50m/100m/200m までしかない = ストローク間で
//  distance のレンジが非対称)。裸の "自由形" 等では実データに一致しないため、
// このテストは name_jp の実データ形状を fixture にする。
// ---------------------------------------------------------------------------

describe("getStyleOrderIndex", () => {
  describe("距離接頭辞つき name_jp（styles テーブルの実データ形状）", () => {
    it.each([
      ["25m自由形", 0],
      ["50m自由形", 0],
      ["100m自由形", 0],
      ["1500m自由形", 0],
      ["25m平泳ぎ", 1],
      ["100m平泳ぎ", 1],
      ["200m平泳ぎ", 1],
      ["25m背泳ぎ", 2],
      ["50m背泳ぎ", 2],
      ["25mバタフライ", 3],
      ["100mバタフライ", 3],
      ["100m個人メドレー", 4],
      ["400m個人メドレー", 4],
    ] as const)("%s は stroke index %i を返す", (nameJp, expectedIndex) => {
      expect(getStyleOrderIndex(nameJp)).toBe(expectedIndex);
    });
  });

  describe("裸の日本語名（既存動作の非退行）", () => {
    it.each(STYLES.map((style, index) => [style, index] as const))(
      "%s は stroke index %i を返す",
      (style, expectedIndex) => {
        expect(getStyleOrderIndex(style)).toBe(expectedIndex);
      },
    );
  });

  describe("公式略称キー（PracticeLog.style の実データ形状。既存動作の非退行）", () => {
    it.each([
      ["Fr", 0],
      ["Br", 1],
      ["Ba", 2],
      ["Fly", 3],
      ["IM", 4],
    ] as const)("%s は stroke index %i を返す", (key, expectedIndex) => {
      expect(getStyleOrderIndex(key)).toBe(expectedIndex);
    });
  });

  describe("マップ外の入力", () => {
    it.each(["", "Unknown", "backstroke", "1500m自由形IM", "9999m"])(
      "%s は -1 を返す",
      (input) => {
        expect(getStyleOrderIndex(input)).toBe(-1);
      },
    );
  });

  describe("[Critical 1 再検証] stroke 境界を跨ぐ順序 (1500m自由形 vs 100m平泳ぎ)", () => {
    it("1500m自由形 の index は 100m平泳ぎ の index より小さい (自由形が先に来る)", () => {
      const freestyle1500 = getStyleOrderIndex("1500m自由形");
      const breaststroke100 = getStyleOrderIndex("100m平泳ぎ");
      expect(freestyle1500).toBeLessThan(breaststroke100);
    });

    it("修正前バグの再現防止: 1500m自由形 の distance(1500) は 100m平泳ぎ の distance(100) より大きいが、" +
      "種目ソートは distance の大小ではなく stroke index を primary key にするため、" +
      "distance だけで比較すると逆転してしまう組み合わせでも stroke index 側で正しく判定できる",
      () => {
        // distance 単体の大小関係は「自由形が後に来そう」に見えるが、
        // getStyleOrderIndex は distance を一切見ずに stroke index のみを返すことを確認する
        expect(getStyleOrderIndex("1500m自由形")).toBe(0);
        expect(getStyleOrderIndex("100m平泳ぎ")).toBe(1);
      },
    );
  });
});

// ---------------------------------------------------------------------------
// toStyleCode - 種目コード正規化の唯一の定義元
//
// PM 裁定 (2026-09-02, Issue #13 High対応): Reviewer が「toStyleCode() の大小無視
// マッチが "FR"(フリーリレー略称) を "Fr"(自由形) に潰す。呼び出し元7箇所が
// 無防備」という High を出した。個別呼び出し元にガードを複製するのではなく、
// 定義元であるこの関数自体を2段構造に絞り込んだ:
//   ① canonical との完全一致 (大小区別あり) を最優先
//   ② legacy バグ (.toLowerCase() 正規化コード) が書き込んだ「厳密な全小文字」のみ救済
//   ③ それ以外 (全大文字・混在ケーシング) は null
// 実際に legacy バグが書き込んだのは .toLowerCase() の結果である厳密な全小文字のみで
// あり、全大文字・混在ケーシングの実データは存在しないため、対応範囲を広げる理由もない。
// このテストが「新契約」を固定する唯一のテストであり、各消費側 (goalSetCalculator /
// practiceLogFilter / styleName / racePaceModels 等) はここでの契約を前提にしてよい。
// ---------------------------------------------------------------------------

describe("toStyleCode", () => {
  describe("canonical との完全一致(大小区別あり)は常に通る", () => {
    it.each(["Fr", "Br", "Ba", "Fly", "IM"] as const)("%s はそのまま返る", (code) => {
      expect(toStyleCode(code)).toBe(code);
    });

    it('"IM" は canonical 自体が全大文字だが、完全一致で確定するため弾かれない(最重要回帰ガード)', () => {
      expect(toStyleCode("IM")).toBe("IM");
    });
  });

  describe("legacy な「厳密な全小文字」は救済される(移行窓の防御)", () => {
    it.each([
      ["fr", "Fr"],
      ["br", "Br"],
      ["ba", "Ba"],
      ["fly", "Fly"],
      ["im", "IM"],
    ] as const)("%s は %s に正規化される", (input, expected) => {
      expect(toStyleCode(input)).toBe(expected);
    });
  });

  describe("[新契約] 全大文字・混在ケーシングは null (リレー略称等との衝突を避けるため非対応)", () => {
    it.each(["FR", "BR", "BA", "FLY", "fR", "Im", "bR"])("%s は null を返す", (input) => {
      expect(toStyleCode(input)).toBeNull();
    });

    it('"FR"(フリーリレー略称)・"MR"(メドレーリレー略称)は自由形に化けず null になる', () => {
      expect(toStyleCode("FR")).toBeNull();
      expect(toStyleCode("MR")).toBeNull();
    });
  });

  describe("null安全性", () => {
    it("null/undefined/空文字は null を返す", () => {
      expect(toStyleCode(null)).toBeNull();
      expect(toStyleCode(undefined)).toBeNull();
      expect(toStyleCode("")).toBeNull();
    });

    it("未知の値(butterfly等の英単語)は null を返す", () => {
      expect(toStyleCode("butterfly")).toBeNull();
      expect(toStyleCode("backstroke")).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// formatStyleAbbrev - 2026-07-22 Sprint 新規
// 種目名のスマホ幅略称化(web CompetitionRecordCard の sm 未満表示 / mobile RecordItem の
// 常時表示)が共用する、ロケール非依存の距離+略称フォーマッタ。
//
// 2026-09 (Issue #13 Reviewer 裁定): SwimStyle 自体が公式英略称と同じ値集合
// (Fr/Br/Ba/Fly/IM) になったため、コード→略称の変換テーブル (STYLE_CODE_TO_ABBREV)
// は恒等写像となり削除された (production 側も削除済み)。formatStyleAbbrev は
// `${distance}m${style.style}` を素通しで組み立てるだけなので、以下のフィクスチャは
// SwimStyle の実際の値集合であるタイトルケースを使う (小文字は型として無効な入力)。
// ---------------------------------------------------------------------------

describe("formatStyleAbbrev", () => {
  describe("style(コード)+distance が揃っている場合(通常経路)", () => {
    it.each([
      ["Fr", 50, "50mFr"],
      ["Br", 100, "100mBr"],
      ["Ba", 200, "200mBa"],
      ["Fly", 100, "100mFly"],
      ["IM", 200, "200mIM"],
    ] as const)("style=%s, distance=%i → %s", (style, distance, expected) => {
      expect(formatStyleAbbrev({ style, distance })).toBe(expected);
    });

    it("distance=0 でも数値として扱われる(!= null のガードのため欠落しない)", () => {
      expect(formatStyleAbbrev({ style: "Fr", distance: 0 })).toBe("0mFr");
    });
  });

  describe("name フォールバック(style/distance が欠落、DB name がある場合)", () => {
    it("「200IM」のような先頭数字+略称の name は、数字直後に m を挿入して「200mIM」になる", () => {
      expect(formatStyleAbbrev({ name: "200IM" })).toBe("200mIM");
    });

    it("「50Fr」のような name も同様に「50mFr」になる", () => {
      expect(formatStyleAbbrev({ name: "50Fr" })).toBe("50mFr");
    });

    it("distance はあるが style(コード)が無い場合も name フォールバックが使われる", () => {
      expect(formatStyleAbbrev({ distance: 200, name: "200IM" })).toBe("200mIM");
    });

    it("style(コード)はあるが distance が無い(null)場合も name フォールバックが使われる", () => {
      expect(formatStyleAbbrev({ style: "IM", distance: null, name: "200IM" })).toBe("200mIM");
    });
  });

  describe("name_jp フォールバック(style/distance/name すべて欠落)", () => {
    it("name_jp のみある場合はそのまま返す(距離接頭辞つき実データ形状)", () => {
      expect(formatStyleAbbrev({ name_jp: "50m自由形" })).toBe("50m自由形");
    });
  });

  describe("null/欠落時のフォールバック", () => {
    it("style オブジェクト自体が null のとき「-」を返す", () => {
      expect(formatStyleAbbrev(null)).toBe("-");
    });

    it("style オブジェクト自体が undefined のとき「-」を返す", () => {
      expect(formatStyleAbbrev(undefined)).toBe("-");
    });

    it("style/distance/name/name_jp すべて無い(空オブジェクト)とき「-」を返す", () => {
      expect(formatStyleAbbrev({})).toBe("-");
    });

    it("style コードのみあり distance が無く、name/name_jp も無い場合は「-」を返す", () => {
      expect(formatStyleAbbrev({ style: "Fr" })).toBe("-");
    });
  });

  describe("優先順位(style+distance > name > name_jp > '-')の確認", () => {
    it("style+distance と name が両方ある場合、style+distance が優先される", () => {
      expect(formatStyleAbbrev({ style: "Fr", distance: 50, name: "999XX" })).toBe("50mFr");
    });

    it("name と name_jp が両方ある場合、name が優先される", () => {
      expect(formatStyleAbbrev({ name: "200IM", name_jp: "200m個人メドレー" })).toBe("200mIM");
    });
  });
});
