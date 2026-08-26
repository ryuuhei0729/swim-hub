// =============================================================================
// waPoints.test.ts - WA (World Aquatics) ポイント計算 共有ユーティリティのテスト
// =============================================================================
// Sprint Contract (チーム詳細メンバータブ「WAポイントで比較」機能) 検証観点:
//
//   [V-01] getWaBaseTime が LCM/SCM × 男女 × 対象種目・距離 の base time を
//          公式表と一致する実数値で返す (66通り全数、Planner取得値をPMが世界記録と
//          突合済みの正データ)
//   [V-02] LCM×100IM (男女とも base time が公式に存在しない) は null を返す
//   [V-03] calculateWaPoints が floor 丸め (T=44.94, B=46.40 → 1100)。
//          round 実装に書き換えると 1101 になり本テストは red になる (判別ケース)
//   [V-04] calculateWaPoints の境界値: T===B で 1000、T<=0 で 0 (Infinity/NaN 防止)
//   [V-05] getMemberBestWaPoints は is_relaying=true の記録を計算対象から除外する
//          (ガードを外すと結果が変わることを別テストで実証: 除外しない場合に
//          得られるはずの高得点が採用されないことを確認)
//   [V-06] getMemberBestWaPoints は base time が存在しない組合せ (IM100×LCM) の
//          記録をスキップする
//   [V-07] getMemberBestWaPoints は「最大 WA ポイント」を採用する (絶対タイムが
//          最速の記録ではない別種目のほうが点数が高い場合、その記録を選ぶ)
//   [V-08] getMemberBestWaPoints は有効な記録が1件も無い場合 null を返す
//   [V-09] rankMembersByWaPoints は points 降順でソートし、同点でも連番の rank
//          (1,2,3,...) を振る (TeamCompetitionRecordsModal の index+1 方式踏襲)
//   [V-10] rankMembersByWaPoints は有効記録の無いメンバーをランキングから除外する
//   [V-11] rankMembersByWaPoints は空配列入力で空配列を返す
//   [V-12] 同一タイムでも性別が異なれば WA ポイントが異なる (性別分岐の実証)
//
// 現時点で `apps/shared/utils/waPoints.ts` は未実装 (Phase B で Developer が新設) の
// ため、このテストは実装前は import 解決に失敗して全滅する。これは意図的な
// 「検出器」であり、Developer 実装後に green になることを Sprint Contract の
// 完了条件とする。
//
// 期待値の作成方法: 本テストの期待値は全て「PM が公式PDF/世界記録突合で確定した
// base time の実数値」と「P = floor(1000 * (B/T)^3) という仕様の数式」から独立に
// 計算したハードコード値である。Developer の実装を呼び出して期待値を生成しては
// いない (トートロジー回避)。
// =============================================================================

import { describe, expect, it } from "vitest";
import {
  calculateWaPoints,
  getMemberBestWaPoints,
  getWaBaseTime,
  rankMembersByWaPoints,
  type MemberWaPointsInput,
  type WaPointRecordInput,
} from "../../utils/waPoints";
import type { StyleTranslationKey } from "../../utils/swimStyles";

// ---------------------------------------------------------------------------
// [V-01][V-02] getWaBaseTime: 公式 base time 表 (2026年 LCM/SCM 有効表, PM確定値)
// ---------------------------------------------------------------------------

type PoolType = 0 | 1; // 0: 短水路(SCM), 1: 長水路(LCM)
type Gender = 0 | 1; // 0: 男性, 1: 女性

// [poolType, gender, styleKey, distance, expectedBaseTimeSeconds | null]
const BASE_TIME_TABLE: ReadonlyArray<
  readonly [PoolType, Gender, StyleTranslationKey, number, number | null]
> = [
  // --- LCM (poolType=1) ---
  [1, 0, "Fr", 50, 20.91],
  [1, 1, "Fr", 50, 23.61],
  [1, 0, "Fr", 100, 46.4],
  [1, 1, "Fr", 100, 51.71],
  [1, 0, "Fr", 200, 102.0],
  [1, 1, "Fr", 200, 112.23],
  [1, 0, "Fr", 400, 219.96],
  [1, 1, "Fr", 400, 234.18],
  [1, 0, "Fr", 800, 452.12],
  [1, 1, "Fr", 800, 484.12],
  [1, 0, "Ba", 50, 23.55],
  [1, 1, "Ba", 50, 26.86],
  [1, 0, "Ba", 100, 51.6],
  [1, 1, "Ba", 100, 57.13],
  [1, 0, "Ba", 200, 111.92],
  [1, 1, "Ba", 200, 123.14],
  [1, 0, "Br", 50, 25.95],
  [1, 1, "Br", 50, 29.16],
  [1, 0, "Br", 100, 56.88],
  [1, 1, "Br", 100, 64.13],
  [1, 0, "Br", 200, 125.48],
  [1, 1, "Br", 200, 137.55],
  [1, 0, "Fly", 50, 22.27],
  [1, 1, "Fly", 50, 24.43],
  [1, 0, "Fly", 100, 49.45],
  [1, 1, "Fly", 100, 54.6],
  [1, 0, "Fly", 200, 110.34],
  [1, 1, "Fly", 200, 121.81],
  [1, 0, "IM", 200, 112.69],
  [1, 1, "IM", 200, 125.7],
  [1, 0, "IM", 400, 242.5],
  [1, 1, "IM", 400, 263.65],
  // [V-02] LCM に 100IM の base time は存在しない
  [1, 0, "IM", 100, null],
  [1, 1, "IM", 100, null],

  // --- SCM (poolType=0) ---
  [0, 0, "Fr", 50, 19.9],
  [0, 1, "Fr", 50, 22.83],
  [0, 0, "Fr", 100, 44.84],
  [0, 1, "Fr", 100, 50.25],
  [0, 0, "Fr", 200, 98.61],
  [0, 1, "Fr", 200, 110.31],
  [0, 0, "Fr", 400, 212.25],
  [0, 1, "Fr", 400, 230.25],
  [0, 0, "Fr", 800, 440.46],
  [0, 1, "Fr", 800, 477.42],
  [0, 0, "Ba", 50, 22.11],
  [0, 1, "Ba", 50, 25.23],
  [0, 0, "Ba", 100, 48.33],
  [0, 1, "Ba", 100, 54.02],
  [0, 0, "Ba", 200, 105.63],
  [0, 1, "Ba", 200, 118.04],
  [0, 0, "Br", 50, 24.95],
  [0, 1, "Br", 50, 28.37],
  [0, 0, "Br", 100, 55.28],
  [0, 1, "Br", 100, 62.36],
  [0, 0, "Br", 200, 120.16],
  [0, 1, "Br", 200, 132.5],
  [0, 0, "Fly", 50, 21.32],
  [0, 1, "Fly", 50, 23.94],
  [0, 0, "Fly", 100, 47.71],
  [0, 1, "Fly", 100, 52.71],
  [0, 0, "Fly", 200, 106.85],
  [0, 1, "Fly", 200, 119.32],
  [0, 0, "IM", 100, 49.28],
  [0, 1, "IM", 100, 55.11],
  [0, 0, "IM", 200, 108.88],
  [0, 1, "IM", 200, 121.63],
  [0, 0, "IM", 400, 234.81],
  [0, 1, "IM", 400, 255.48],
];

describe("[V-01][V-02] getWaBaseTime: 公式 base time 表 (66通りの実数値 + 2通りのnull)", () => {
  it.each(BASE_TIME_TABLE)(
    "poolType=%s gender=%s style=%s distance=%sm → %s",
    (poolType, gender, styleKey, distance, expected) => {
      expect(getWaBaseTime(poolType, gender, styleKey, distance)).toBe(expected);
    },
  );

  it("[V-01-count] BASE_TIME_TABLE は非nullが66件・nullが2件であること (テーブル自体の破損防止)", () => {
    const nonNull = BASE_TIME_TABLE.filter(([, , , , v]) => v !== null);
    const nullOnly = BASE_TIME_TABLE.filter(([, , , , v]) => v === null);
    expect(nonNull).toHaveLength(66);
    expect(nullOnly).toHaveLength(2);
  });

  it("[V-02] 未対応の種目・距離組合せ (対象外の1500mFr) は null を返す", () => {
    expect(getWaBaseTime(1, 0, "Fr", 1500)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// [V-03][V-04] calculateWaPoints: floor 丸め・境界値
// ---------------------------------------------------------------------------

describe("[V-03] calculateWaPoints: floor 丸め (round との判別ケース)", () => {
  it("[V-03] B=46.40, T=44.94 → 1100 (raw=1100.6639..., floorのみ1100/roundは1101になる判別ケース)", () => {
    // round に書き換えられていると 1101 が返り、この assertion が red になる。
    expect(calculateWaPoints(46.4, 44.94)).toBe(1100);
  });

  it("[V-03-companion] B=46.40, T=44.96 → 1099 (floor/round が偶然一致する非判別ケース、参考値)", () => {
    expect(calculateWaPoints(46.4, 44.96)).toBe(1099);
  });
});

describe("[V-04] calculateWaPoints: 境界値", () => {
  it("[V-04] T === B のとき 1000 を返す (SCM 50Fr男子 base time で自己検証)", () => {
    expect(calculateWaPoints(19.9, 19.9)).toBe(1000);
  });

  it("[V-04] T = 0 のとき 0 を返す (Infinity 漏出防止)", () => {
    expect(calculateWaPoints(46.4, 0)).toBe(0);
  });

  it("[V-04] T が負数のとき 0 を返す (異常入力の防御)", () => {
    expect(calculateWaPoints(46.4, -1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// [V-05][V-06][V-07][V-08] getMemberBestWaPoints
// ---------------------------------------------------------------------------

function record(overrides: Partial<WaPointRecordInput>): WaPointRecordInput {
  return {
    time: 100,
    poolType: 1,
    gender: 0,
    styleKey: "Fr",
    distance: 100,
    isRelaying: false,
    ...overrides,
  };
}

describe("[V-05] getMemberBestWaPoints: is_relaying=true の記録を除外する", () => {
  it("[V-05] 有効な非リレー記録が無く、リレーイングのフォールバックのみの場合は null を返す (useMemberBestTimesの混入バグ再現)", () => {
    // 100Fr LCM 男子、is_relaying=true のみ (useMemberBestTimesのフォールバックエントリ相当)
    const records: WaPointRecordInput[] = [
      record({ time: 45.0, poolType: 1, gender: 0, styleKey: "Fr", distance: 100, isRelaying: true }),
    ];
    expect(getMemberBestWaPoints(records)).toBeNull();
  });

  it("[V-05] リレーイング記録の方が高得点でも、非リレー記録が採用される (ガードを外すとこのテストが red になる)", () => {
    // 200Fr LCM 男子 base=102.00: 非リレー T=110.00 → 797点、リレーイング T=95.00 → 1237点
    const records: WaPointRecordInput[] = [
      record({ time: 110.0, poolType: 1, gender: 0, styleKey: "Fr", distance: 200, isRelaying: false }),
      record({ time: 95.0, poolType: 1, gender: 0, styleKey: "Fr", distance: 200, isRelaying: true }),
    ];
    const result = getMemberBestWaPoints(records);
    expect(result).not.toBeNull();
    expect(result?.points).toBe(797);
    expect(result?.time).toBe(110.0);
  });
});

describe("[V-06] getMemberBestWaPoints: base time が無い組合せをスキップする", () => {
  it("[V-06] IM100×LCM(poolType=1) の記録のみの場合は null を返す (base timeが公式に存在しないため)", () => {
    const records: WaPointRecordInput[] = [
      record({ time: 55.0, poolType: 1, gender: 0, styleKey: "IM", distance: 100, isRelaying: false }),
    ];
    expect(getMemberBestWaPoints(records)).toBeNull();
  });

  it("[V-06] IM100×LCM は無視されつつ、IM100×SCM(poolType=0)は計算対象になる", () => {
    // SCM男子 IM100 base=49.28, T=49.28 → 1000点
    const records: WaPointRecordInput[] = [
      record({ time: 55.0, poolType: 1, gender: 0, styleKey: "IM", distance: 100, isRelaying: false }),
      record({ time: 49.28, poolType: 0, gender: 0, styleKey: "IM", distance: 100, isRelaying: false }),
    ];
    const result = getMemberBestWaPoints(records);
    expect(result?.points).toBe(1000);
    expect(result?.poolType).toBe(0);
  });
});

describe("[V-07] getMemberBestWaPoints: 全記録中の最大 WA ポイントを採用する (絶対タイム最速ではない)", () => {
  it("[V-07] 別種目のほうが得点が高い場合、そちらを採用する", () => {
    // 50Fr SCM 男子 base=19.90, T=19.90 → 1000点 (絶対タイムは最速)
    // 200Fr SCM 男子 base=98.61, T=95.00 → 1118点 (絶対タイムは遅いが得点は高い)
    //   floor(1000 * (98.61/95.00)^3) = floor(1118.386...) = 1118
    const records: WaPointRecordInput[] = [
      record({ time: 19.9, poolType: 0, gender: 0, styleKey: "Fr", distance: 50, isRelaying: false }),
      record({ time: 95.0, poolType: 0, gender: 0, styleKey: "Fr", distance: 200, isRelaying: false }),
    ];
    const result = getMemberBestWaPoints(records);
    expect(result?.distance).toBe(200);
    expect(result?.points).toBe(1118);
  });
});

describe("[V-08] getMemberBestWaPoints: 有効な記録が1件も無い場合", () => {
  it("[V-08] 空配列 → null", () => {
    expect(getMemberBestWaPoints([])).toBeNull();
  });

  it("[V-08] 全記録が除外対象 (リレーイングのみ + base timeなしのみ) → null", () => {
    const records: WaPointRecordInput[] = [
      record({ isRelaying: true }),
      record({ styleKey: "IM", distance: 100, poolType: 1, isRelaying: false }),
    ];
    expect(getMemberBestWaPoints(records)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// [V-09][V-10][V-11] rankMembersByWaPoints
// ---------------------------------------------------------------------------

function member(overrides: Partial<MemberWaPointsInput>): MemberWaPointsInput {
  return {
    memberId: "member-1",
    displayName: "Member",
    records: [],
    ...overrides,
  };
}

describe("[V-09] rankMembersByWaPoints: 降順ソート + 同点でも連番rank", () => {
  it("[V-09] points 降順に並び、rankは1から連番になる", () => {
    const members: MemberWaPointsInput[] = [
      member({
        memberId: "low",
        displayName: "Low",
        records: [record({ time: 46.4, poolType: 1, gender: 0, styleKey: "Fr", distance: 100 })], // 1000点
      }),
      member({
        memberId: "high",
        displayName: "High",
        records: [record({ time: 44.94, poolType: 1, gender: 0, styleKey: "Fr", distance: 100 })], // 1100点
      }),
    ];
    const ranking = rankMembersByWaPoints(members);
    expect(ranking.map((r) => r.memberId)).toEqual(["high", "low"]);
    expect(ranking.map((r) => r.rank)).toEqual([1, 2]);
  });

  it("[V-09] 同点の2名は同じpointsだが rank は連番 (1,2) になる (dense rank ではない)", () => {
    const tiedRecord = record({ time: 46.4, poolType: 1, gender: 0, styleKey: "Fr", distance: 100 }); // 1000点
    const members: MemberWaPointsInput[] = [
      member({ memberId: "a", records: [tiedRecord] }),
      member({ memberId: "b", records: [tiedRecord] }),
    ];
    const ranking = rankMembersByWaPoints(members);
    expect(ranking[0].points).toBe(ranking[1].points);
    expect(ranking.map((r) => r.rank)).toEqual([1, 2]);
  });
});

describe("[V-10] rankMembersByWaPoints: 有効記録の無いメンバーを除外する", () => {
  it("[V-10] 記録0件のメンバーはランキングに現れない", () => {
    const members: MemberWaPointsInput[] = [
      member({
        memberId: "has-record",
        records: [record({ time: 46.4, poolType: 1, gender: 0, styleKey: "Fr", distance: 100 })],
      }),
      member({ memberId: "no-record", records: [] }),
    ];
    const ranking = rankMembersByWaPoints(members);
    expect(ranking).toHaveLength(1);
    expect(ranking.map((r) => r.memberId)).toEqual(["has-record"]);
  });

  it("[V-10] リレーイングのみ・base timeなしのみのメンバーも除外される", () => {
    const members: MemberWaPointsInput[] = [
      member({
        memberId: "only-relaying",
        records: [record({ isRelaying: true })],
      }),
      member({
        memberId: "only-im100-lcm",
        records: [record({ styleKey: "IM", distance: 100, poolType: 1, isRelaying: false })],
      }),
    ];
    expect(rankMembersByWaPoints(members)).toHaveLength(0);
  });
});

describe("[V-11] rankMembersByWaPoints: 空配列入力", () => {
  it("[V-11] 空配列 → 空配列", () => {
    expect(rankMembersByWaPoints([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// [V-12] 性別分岐の実証
// ---------------------------------------------------------------------------

describe("[V-12] 同一タイムでも性別で WA ポイントが異なる", () => {
  it("[V-12] SCM 100Fr T=50.00: 男子(base=44.84)と女子(base=50.25)で得点が異なる", () => {
    const malePoints = calculateWaPoints(getWaBaseTime(0, 0, "Fr", 100)!, 50.0);
    const femalePoints = calculateWaPoints(getWaBaseTime(0, 1, "Fr", 100)!, 50.0);
    expect(malePoints).toBe(721);
    expect(femalePoints).toBe(1015);
    expect(malePoints).not.toBe(femalePoints);
  });
});
