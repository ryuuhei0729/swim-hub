// =============================================================================
// regionalStandardTimes.test.ts - `/time-level` ページ用 都中/都高 基準タイム
// 共有ユーティリティのテスト
// =============================================================================
// Sprint Contract (`/time-level` 新規ページ) 検証観点:
//
//   [V-R01] getTochuStandardTime が VERIFIED_DATA.md セクション4の TOCHU_LCM 全26件と
//           完全一致する実数値 (秒) を返す
//   [V-R02] getTokoStandardTime が同セクションの TOKO_LCM 全32件と完全一致する実数値
//           (秒) を返す。うち12件は `.09` 終端 (D1: 原典表記のまま。誤植ではない。
//           出典: 都高校大会 出場制限タイム表 PDF。ユーザー提供画像との全数突合済み)
//   [V-R03] 都中に存在しない組合せ (背/平/バタ50m男女6件、男子800自由形、女子1500自由形、
//           IM100 男女) は null を返す
//   [V-R04] 都高に存在しない組合せ (男子800自由形、女子1500自由形、IM100 男女) は
//           null を返す (都高は50m4泳法が男女とも存在するため都中よりnullが少ない)
//   [V-R05] evaluateStandardTime の境界値: time === baseTime で
//           { points: 1000, cleared: true, diffSeconds: 0 } (D4: 「以内」は等号を含む)
//   [V-R06] evaluateStandardTime: 突破 (time < baseTime) で cleared=true, diffSeconds<0,
//           points>1000
//   [V-R07] evaluateStandardTime: 未突破 (time > baseTime) で cleared=false, diffSeconds>0,
//           points<1000
//   [V-R08] evaluateStandardTime の points は calculateWaPoints と同じ floor 丸め式
//           (P = floor(1000*(B/T)^3)) の実数値と一致する (round と誤判別しない具体値)
//   [V-R09] getSelectableEvents(0) (男子) が WA/都中/都高 の和集合である 18 組と
//           要素単位で完全一致する (件数一致だけに頼らない)
//   [V-R10] getSelectableEvents(1) (女子) が同様に 17 組と要素単位で完全一致する
//   [V-R11] 性別による選択肢の差分は「男子の自由形1500のみ」であることを実証する
//           (男子は含み女子は含まない。これ以外の差分が無いことも確認する)
//   [V-R12] 3指標の独立判定: 男子800m自由形(長水路)は WA に基準タイムがあり
//           都中/都高には無い。男子1500m自由形(長水路)は逆に都中/都高にあり WA には無い
//           (D6 の「性別切替でリセットが発火するのは Fr/1500 のみ」の根拠データ)
//   [V-R13] evaluateStandardTime は time/baseTime が不正 (0以下・NaN・Infinity) のとき
//           null を返す (Reviewer指摘: calculateWaPoints には0以下の境界テストがあるのに
//           対になるガードテストが無かったギャップの解消)
//   [V-R14] 不変条件: evaluateStandardTime が非nullを返したとき、
//           cleared===true ならば points>=1000、cleared===false ならば points<1000。
//           都中26件+都高32件=58件の全基準タイムに対し、基準ちょうど/基準より速い/
//           基準より遅い の3パターンで検証する (仕様から導出した不変条件であり、
//           実装のロジックを写した期待値ではないためトートロジーにならない)
//
// 実装 (apps/shared/utils/regionalStandardTimes.ts) が存在しない場合、本テストは
// import 解決に失敗して全滅する。これは意図的な「検出器」である。
//
// 期待値の作成方法 (トートロジー回避): 全ての期待値は
// `/private/tmp/.../scratchpad/VERIFIED_DATA.md` セクション4 (PMがPDFから抽出し
// ユーザー提供画像と全58値突合済みの確定値) と、Sprint Contract D3/D4 の仕様式
// (P = floor(1000*(B/T)^3)、cleared = time<=baseTime) から独立に算出したハードコード値
// である。実装を呼び出して期待値を生成してはいない。3乗式そのものをテスト内に
// 再実装することも禁止 (過去に「バグのレプリカがバグっている」だけの red を出した実例
// があるため)。points の期待値は Node で事前計算したリテラル数値を使う。
// =============================================================================

import { describe, expect, it } from "vitest";
import {
  evaluateStandardTime,
  getSelectableEvents,
  getTochuStandardTime,
  getTokoStandardTime,
} from "../../utils/regionalStandardTimes";
import type { StyleTranslationKey } from "../../utils/swimStyles";
import { getWaBaseTime } from "../../utils/waPoints";

type Gender = 0 | 1; // 0: 男子, 1: 女子

// evaluateStandardTime は不正入力(0以下・NaN・Infinity)で null を返す契約になった
// (PM確定。矛盾した組 {points:0, cleared:true} を型レベルで作れなくするため)。
// `!` (非null断定) は使わず、明示的に非nullを assert してから中身を使う。
function assertNotNull<T>(value: T | null): T {
  expect(value).not.toBeNull();
  if (value === null) {
    throw new Error("evaluateStandardTime が予期せず null を返した (直前の assert で検出済みのはず)");
  }
  return value;
}

// ---------------------------------------------------------------------------
// [V-R01] 都中 (TOCHU_LCM) 全26件 — VERIFIED_DATA.md セクション4より転記
// [gender, styleKey, distance, expectedSeconds]
// ---------------------------------------------------------------------------
const TOCHU_TABLE: ReadonlyArray<readonly [Gender, StyleTranslationKey, number, number]> = [
  [0, "Fr", 50, 29.5],
  [0, "Fr", 100, 66],
  [0, "Fr", 200, 137],
  [0, "Fr", 400, 285],
  [0, "Fr", 1500, 1140],
  [0, "Ba", 100, 74],
  [0, "Ba", 200, 163],
  [0, "Br", 100, 77],
  [0, "Br", 200, 168],
  [0, "Fly", 100, 70],
  [0, "Fly", 200, 166],
  [0, "IM", 200, 153],
  [0, "IM", 400, 330],
  [1, "Fr", 50, 32.5],
  [1, "Fr", 100, 72],
  [1, "Fr", 200, 144],
  [1, "Fr", 400, 293],
  [1, "Fr", 800, 660],
  [1, "Ba", 100, 80],
  [1, "Ba", 200, 167],
  [1, "Br", 100, 90],
  [1, "Br", 200, 196],
  [1, "Fly", 100, 83],
  [1, "Fly", 200, 185],
  [1, "IM", 200, 170],
  [1, "IM", 400, 360],
];

// ---------------------------------------------------------------------------
// [V-R02] 都高 (TOKO_LCM) 全32件 — VERIFIED_DATA.md セクション4より転記
// うち .09 終端12件は D1 により原典表記のまま採用 (誤植ではない)
// ---------------------------------------------------------------------------
const TOKO_TABLE: ReadonlyArray<readonly [Gender, StyleTranslationKey, number, number]> = [
  [0, "Fr", 50, 27.3],
  [0, "Fr", 100, 58.8],
  [0, "Fr", 200, 135.09], // D1: .09 終端 (原典表記のまま。誤植ではない)
  [0, "Fr", 400, 272.09], // D1
  [0, "Fr", 1500, 1052.69],
  [0, "Ba", 50, 30.2],
  [0, "Ba", 100, 73.09], // D1
  [0, "Ba", 200, 153.3],
  [0, "Br", 50, 33.7],
  [0, "Br", 100, 74.2],
  [0, "Br", 200, 159.02],
  [0, "Fly", 50, 28.9],
  [0, "Fly", 100, 66.09], // D1
  [0, "Fly", 200, 165.09], // D1
  [0, "IM", 200, 149.09], // D1
  [0, "IM", 400, 330.09], // D1
  [1, "Fr", 50, 31.49],
  [1, "Fr", 100, 67.09], // D1
  [1, "Fr", 200, 155.09], // D1 (原典どおり。都中2:24.0より遅い。異常ではない=D2)
  [1, "Fr", 400, 292.32],
  [1, "Fr", 800, 609.29],
  [1, "Ba", 50, 33.8],
  [1, "Ba", 100, 78.89],
  [1, "Ba", 200, 165.69],
  [1, "Br", 50, 37.8],
  [1, "Br", 100, 89.5],
  [1, "Br", 200, 195.09], // D1
  [1, "Fly", 50, 32.1],
  [1, "Fly", 100, 81.84],
  [1, "Fly", 200, 180.09], // D1
  [1, "IM", 200, 171.39], // D1 (原典どおり。都中2:50.0より遅い。異常ではない=D2)
  [1, "IM", 400, 360.09], // D1 (原典どおり。都中5:30.0/6:00.0より遅い。異常ではない=D2)
];

describe("[V-R01] getTochuStandardTime: TOCHU_LCM 全26件が実数値と一致する", () => {
  it.each(TOCHU_TABLE)("gender=%s style=%s distance=%sm → %s秒", (gender, styleKey, distance, expected) => {
    expect(getTochuStandardTime(gender, styleKey, distance)).toBe(expected);
  });

  it("[V-R01-count] TOCHU_TABLE は26件であること (データテーブル自体の破損防止)", () => {
    expect(TOCHU_TABLE).toHaveLength(26);
  });
});

describe("[V-R02] getTokoStandardTime: TOKO_LCM 全32件が実数値と一致する", () => {
  it.each(TOKO_TABLE)("gender=%s style=%s distance=%sm → %s秒", (gender, styleKey, distance, expected) => {
    expect(getTokoStandardTime(gender, styleKey, distance)).toBe(expected);
  });

  it("[V-R02-count] TOKO_TABLE は32件であること (データテーブル自体の破損防止)", () => {
    expect(TOKO_TABLE).toHaveLength(32);
  });

  it("[V-R02-dot09] .09 終端の値はちょうど12件であること (D1の裏付け。三重検証+ユーザー画像突合済み)", () => {
    const dot09Count = TOKO_TABLE.filter(([, , , seconds]) => {
      const cents = Math.round((seconds % 1) * 100);
      return cents === 9;
    }).length;
    expect(dot09Count).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// [V-R03] 都中に存在しない組合せ → null
// ---------------------------------------------------------------------------
describe("[V-R03] getTochuStandardTime: 存在しない組合せは null を返す", () => {
  const MISSING_50M_STYLES: StyleTranslationKey[] = ["Ba", "Br", "Fly"];

  for (const gender of [0, 1] as const) {
    for (const styleKey of MISSING_50M_STYLES) {
      it(`gender=${gender} ${styleKey}50m (自由形以外の50mは原典が空欄) → null`, () => {
        expect(getTochuStandardTime(gender, styleKey, 50)).toBeNull();
      });
    }
  }

  it("男子800m自由形 (男子は1500のみ) → null", () => {
    expect(getTochuStandardTime(0, "Fr", 800)).toBeNull();
  });

  it("女子1500m自由形 (女子は800のみ) → null", () => {
    expect(getTochuStandardTime(1, "Fr", 1500)).toBeNull();
  });

  it("IM100 (都中に個人メドレー100mの設定なし、男女とも) → null", () => {
    expect(getTochuStandardTime(0, "IM", 100)).toBeNull();
    expect(getTochuStandardTime(1, "IM", 100)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// [V-R04] 都高に存在しない組合せ → null (都中よりnullは少ない = 50mは全て存在する)
// ---------------------------------------------------------------------------
describe("[V-R04] getTokoStandardTime: 存在しない組合せは null を返す", () => {
  it("男子800m自由形 (男子は1500のみ) → null", () => {
    expect(getTokoStandardTime(0, "Fr", 800)).toBeNull();
  });

  it("女子1500m自由形 (女子は800のみ) → null", () => {
    expect(getTokoStandardTime(1, "Fr", 1500)).toBeNull();
  });

  it("IM100 (都高に個人メドレー100mの設定なし、男女とも) → null", () => {
    expect(getTokoStandardTime(0, "IM", 100)).toBeNull();
    expect(getTokoStandardTime(1, "IM", 100)).toBeNull();
  });

  it("都中と異なり、背泳ぎ/平泳ぎ/バタフライの50mは男女ともnullではない (都高固有の存在パターン)", () => {
    for (const gender of [0, 1] as const) {
      for (const styleKey of ["Ba", "Br", "Fly"] as const) {
        expect(getTokoStandardTime(gender, styleKey, 50)).not.toBeNull();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// [V-R05][V-R06][V-R07][V-R08] evaluateStandardTime
// ---------------------------------------------------------------------------
describe("[V-R05] evaluateStandardTime: 境界値 time === baseTime (D4「以内」は等号を含む)", () => {
  it("都中 男子100m自由形 base=66.0 で time=66.0 のとき cleared:true, diffSeconds:0, points:1000", () => {
    const result = assertNotNull(evaluateStandardTime(66, 66));
    expect(result).toEqual({ points: 1000, cleared: true, diffSeconds: 0 });
  });

  it("都高 男子200m自由形 base=135.09 (.09終端) で time=135.09 のとき cleared:true, diffSeconds:0, points:1000", () => {
    const result = assertNotNull(evaluateStandardTime(135.09, 135.09));
    expect(result.cleared).toBe(true);
    expect(result.diffSeconds).toBe(0);
    expect(result.points).toBe(1000);
  });
});

describe("[V-R06] evaluateStandardTime: 突破 (time < baseTime)", () => {
  it("base=66, time=60 → cleared:true, diffSeconds:-6, points:1331 (floor(1000*(66/60)^3)=1331.0→1331)", () => {
    const result = assertNotNull(evaluateStandardTime(66, 60));
    expect(result.cleared).toBe(true);
    expect(result.diffSeconds).toBe(-6);
    expect(result.points).toBe(1331);
  });
});

describe("[V-R07] evaluateStandardTime: 未突破 (time > baseTime)", () => {
  it("base=66, time=70 → cleared:false, diffSeconds:4, points:838 (floor(1000*(66/70)^3)=838.47...→838)", () => {
    const result = assertNotNull(evaluateStandardTime(66, 70));
    expect(result.cleared).toBe(false);
    expect(result.diffSeconds).toBe(4);
    expect(result.points).toBe(838);
  });

  it("都高 .09終端 base=135.09, time=140 → cleared:false, diffSecondsは約4.91, points:898", () => {
    const result = assertNotNull(evaluateStandardTime(135.09, 140));
    expect(result.cleared).toBe(false);
    expect(result.diffSeconds).toBeCloseTo(4.91, 5);
    expect(result.points).toBe(898);
  });
});

describe("[V-R08] evaluateStandardTime: floor 丸め (round との判別ケース)", () => {
  it("base=46.40, time=44.94 → points:1100 (raw=1100.6639..., floorのみ1100/roundは1101)", () => {
    // calculateWaPoints.test.ts の判別ケースと同一の base/time を再利用し、
    // 都中/都高側でも同じ丸め規則 (floor) が使われていることを確認する。
    const result = assertNotNull(evaluateStandardTime(46.4, 44.94));
    expect(result.points).toBe(1100);
  });
});

// ---------------------------------------------------------------------------
// [V-R13] evaluateStandardTime: 異常入力(0以下・NaN・Infinity)で null を返す
// ---------------------------------------------------------------------------
// 変更理由 (PM確定): 旧実装は evaluateStandardTime(30, -5) が
// { points: 0, cleared: true, diffSeconds: -35 } という「0点なのに突破」という
// 矛盾した組を返していた。sentinel 値ではなく null にすることで、矛盾した組を
// 型レベルで作れなくする方針にした (getTochuStandardTime/getTokoStandardTime/
// getWaBaseTime がすべて null 規約なのに揃えた)。
// Reviewer 指摘: calculateWaPoints には (46.4, 0)/(46.4, -1) の境界テストが既にあるのに、
// 対になる evaluateStandardTime の異常系テストが1件も無かった。このテストの不在自体が
// 実装のガード漏れを見逃す一因になっていたため、ここで補う。
describe("[V-R13] evaluateStandardTime: 異常入力で null を返す", () => {
  it("time が負数 (-5) → null", () => {
    expect(evaluateStandardTime(30, -5)).toBeNull();
  });

  it("time が 0 → null", () => {
    expect(evaluateStandardTime(30, 0)).toBeNull();
  });

  it("time が NaN → null", () => {
    expect(evaluateStandardTime(30, NaN)).toBeNull();
  });

  it("time が Infinity → null", () => {
    expect(evaluateStandardTime(30, Infinity)).toBeNull();
  });

  it("baseTime が 0 → null (baseTime 側の異常)", () => {
    expect(evaluateStandardTime(0, 30)).toBeNull();
  });

  it("baseTime が NaN → null", () => {
    expect(evaluateStandardTime(NaN, 30)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// [V-R14] 不変条件: cleared===true ⇔ points>=1000 (仕様から導出。実装は参照していない)
// ---------------------------------------------------------------------------
// 証明: cleared は time<=baseTime ⇔ B/T>=1 ⇔ floor(1000*(B/T)^3)>=1000。
// 修正前は time<=0 のとき points:0 かつ cleared:true が起きており、この不変条件が
// 破れていた (0点なのに突破、という矛盾)。null 化によりこの矛盾した組は
// 型レベルで作れなくなったはずなので、非null を返す全ケースでこの不変条件が
// 成立することを、都中26件+都高32件=58件の全基準タイム × 3パターン
// (基準ちょうど/基準より速い/基準より遅い) で検証する。
// 期待値は「cleared ならば points>=1000」という仕様上の論理関係であり、
// evaluateStandardTime の実装を呼び出して期待値を作っているわけではない
// (3乗式の再実装や具体的な points 数値の転記はしていない)。
describe("[V-R14] 不変条件: evaluateStandardTime(baseTime, time) が非nullのとき cleared と points の大小関係が矛盾しない", () => {
  const ALL_BASE_TIMES: number[] = [
    ...TOCHU_TABLE.map(([, , , seconds]) => seconds),
    ...TOKO_TABLE.map(([, , , seconds]) => seconds),
  ];

  it("[V-R14-count] 対象基準タイムは58件 (都中26+都高32) であること (データテーブル破損防止)", () => {
    expect(ALL_BASE_TIMES).toHaveLength(58);
  });

  it.each(ALL_BASE_TIMES)(
    "baseTime=%s秒: ちょうど→突破+1000以上、基準より速い→突破+1000以上、基準より遅い→未突破+1000未満",
    (baseTime) => {
      const exact = assertNotNull(evaluateStandardTime(baseTime, baseTime));
      const faster = assertNotNull(evaluateStandardTime(baseTime, baseTime * 0.9));
      const slower = assertNotNull(evaluateStandardTime(baseTime, baseTime * 1.1));

      expect(exact.cleared).toBe(true);
      expect(exact.points).toBeGreaterThanOrEqual(1000);

      expect(faster.cleared).toBe(true);
      expect(faster.points).toBeGreaterThanOrEqual(1000);

      expect(slower.cleared).toBe(false);
      expect(slower.points).toBeLessThan(1000);
    },
  );
});

// ---------------------------------------------------------------------------
// [V-R09][V-R10][V-R11] getSelectableEvents
// ---------------------------------------------------------------------------

// key化ヘルパー (順序に依存しない比較のため)
function toKeySet(events: ReadonlyArray<{ styleKey: StyleTranslationKey; distance: number }>): string[] {
  return events.map((e) => `${e.styleKey}_${e.distance}`).sort();
}

// 男子 (gender=0) の期待値: WA(50/100/200/400/800/Fr, 50/100/200 Ba・Br・Fly, 100/200/400 IM)
// ∪ 都中(1500 Fr 追加) ∪ 都高(1500 Fr, 50 Ba/Br/Fly は既にWAに無いがTOKOにはある→追加無し、
// Ba/Br/Flyの50はWAに既存のため重複) = 18組
// 内訳: Fr{50,100,200,400,800,1500} Ba{50,100,200} Br{50,100,200} Fly{50,100,200} IM{100,200,400}
const EXPECTED_MALE_EVENTS = toKeySet([
  { styleKey: "Fr", distance: 50 },
  { styleKey: "Fr", distance: 100 },
  { styleKey: "Fr", distance: 200 },
  { styleKey: "Fr", distance: 400 },
  { styleKey: "Fr", distance: 800 },
  { styleKey: "Fr", distance: 1500 },
  { styleKey: "Ba", distance: 50 },
  { styleKey: "Ba", distance: 100 },
  { styleKey: "Ba", distance: 200 },
  { styleKey: "Br", distance: 50 },
  { styleKey: "Br", distance: 100 },
  { styleKey: "Br", distance: 200 },
  { styleKey: "Fly", distance: 50 },
  { styleKey: "Fly", distance: 100 },
  { styleKey: "Fly", distance: 200 },
  { styleKey: "IM", distance: 100 },
  { styleKey: "IM", distance: 200 },
  { styleKey: "IM", distance: 400 },
]);

// 女子 (gender=1) の期待値: 男子と同じだが Fr の 1500 が無い (WA/都中/都高いずれにも
// 女子1500自由形が存在しないため) = 17組
const EXPECTED_FEMALE_EVENTS = toKeySet([
  { styleKey: "Fr", distance: 50 },
  { styleKey: "Fr", distance: 100 },
  { styleKey: "Fr", distance: 200 },
  { styleKey: "Fr", distance: 400 },
  { styleKey: "Fr", distance: 800 },
  { styleKey: "Ba", distance: 50 },
  { styleKey: "Ba", distance: 100 },
  { styleKey: "Ba", distance: 200 },
  { styleKey: "Br", distance: 50 },
  { styleKey: "Br", distance: 100 },
  { styleKey: "Br", distance: 200 },
  { styleKey: "Fly", distance: 50 },
  { styleKey: "Fly", distance: 100 },
  { styleKey: "Fly", distance: 200 },
  { styleKey: "IM", distance: 100 },
  { styleKey: "IM", distance: 200 },
  { styleKey: "IM", distance: 400 },
]);

describe("[V-R09] getSelectableEvents(0) 男子: WA/都中/都高の和集合18組と要素単位で完全一致する", () => {
  it("18組の内訳が完全一致する (件数一致だけに頼らない厳密比較)", () => {
    const actual = toKeySet(getSelectableEvents(0));
    expect(actual).toEqual(EXPECTED_MALE_EVENTS);
    expect(actual).toHaveLength(18);
  });

  it("男子800m自由形を含む (WA由来。都中/都高には無いが選択可能でなければならない)", () => {
    expect(toKeySet(getSelectableEvents(0))).toContain("Fr_800");
  });

  it("男子1500m自由形を含む (都中/都高由来。WAには無いが選択可能でなければならない)", () => {
    expect(toKeySet(getSelectableEvents(0))).toContain("Fr_1500");
  });
});

describe("[V-R10] getSelectableEvents(1) 女子: WA/都中/都高の和集合17組と要素単位で完全一致する", () => {
  it("17組の内訳が完全一致する (件数一致だけに頼らない厳密比較)", () => {
    const actual = toKeySet(getSelectableEvents(1));
    expect(actual).toEqual(EXPECTED_FEMALE_EVENTS);
    expect(actual).toHaveLength(17);
  });

  it("女子は1500m自由形を含まない (WA/都中/都高いずれにも女子1500自由形は存在しない)", () => {
    expect(toKeySet(getSelectableEvents(1))).not.toContain("Fr_1500");
  });

  it("女子も800m自由形は含む (都中/都高/WAいずれにも女子800自由形は存在する)", () => {
    expect(toKeySet(getSelectableEvents(1))).toContain("Fr_800");
  });
});

describe("[V-R11] 性別による選択肢の差分は「男子の自由形1500のみ」であることの実証 (PM訂正反映)", () => {
  it("男子の選択肢から女子の選択肢を引いた差集合は {Fr_1500} の1件のみ", () => {
    const maleOnly = new Set(toKeySet(getSelectableEvents(0)));
    const female = new Set(toKeySet(getSelectableEvents(1)));
    const diff = [...maleOnly].filter((key) => !female.has(key));
    expect(diff).toEqual(["Fr_1500"]);
  });

  it("女子の選択肢から男子の選択肢を引いた差集合は空 (女子固有の選択肢は無い = 女子は男子の部分集合)", () => {
    const male = new Set(toKeySet(getSelectableEvents(0)));
    const female = new Set(toKeySet(getSelectableEvents(1)));
    const diff = [...female].filter((key) => !male.has(key));
    expect(diff).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// [V-R12] 3指標が独立して判定される根拠データ (D6 のリセット挙動テストの前提)
// ---------------------------------------------------------------------------
describe("[V-R12] 男子800m自由形/1500m自由形(長水路)で WA と 都中/都高 が相互排他的に存在する", () => {
  it("男子800m自由形(長水路): WA には基準タイムがあり、都中/都高には無い", () => {
    expect(getWaBaseTime(1, 0, "Fr", 800)).not.toBeNull();
    expect(getTochuStandardTime(0, "Fr", 800)).toBeNull();
    expect(getTokoStandardTime(0, "Fr", 800)).toBeNull();
  });

  it("男子1500m自由形(長水路・短水路とも): WA には基準タイムが無く、都中/都高にはある", () => {
    expect(getWaBaseTime(1, 0, "Fr", 1500)).toBeNull();
    expect(getWaBaseTime(0, 0, "Fr", 1500)).toBeNull();
    expect(getTochuStandardTime(0, "Fr", 1500)).toBe(1140);
    expect(getTokoStandardTime(0, "Fr", 1500)).toBe(1052.69);
  });
});
