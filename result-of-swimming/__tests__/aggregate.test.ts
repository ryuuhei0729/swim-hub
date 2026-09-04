// =============================================================================
// aggregate.test.ts - RawRace[] -> RacePaceModel[]
// =============================================================================
// 検証観点:
//   [V-A1] グループ化キーが gender/pool/stroke/distance/ageCategory/bucket で効く
//   [V-A2] LAP比率の median/p25/p75 が正しい
//   [V-A3] リレー・DSQ・タイム欠損が集計に入らない
//   [V-A4] minSampleCount 未満のグループは出力しない
//   [V-A5] poolLength 25|50 -> pool_type 0|1 の変換が1箇所で行われる
//   [V-A6] ageCategoryMode で学種別/一括を切り替えられる
//   [V-A7] 出力順が決定的 (冪等 upsert のため)
// =============================================================================

import { describe, expect, it } from "vitest";
import { aggregate, isAggregatable, toPoolType } from "../src/aggregation/aggregate";
import type { RawRace } from "../src/types";

/** 100m自由形 (長水路) のレースを1件作る。splits は 50/100 の累積 */
function race(over: Partial<RawRace> = {}): RawRace {
  const finalTimeMs = over.finalTimeMs ?? 50000;
  const first = Math.round(finalTimeMs * 0.48);
  return {
    sourceRaceId: Math.random().toString(36).slice(2),
    sourceUrl: "https://example.test/r",
    gender: "male",
    stroke: "Fr",
    distance: 100,
    poolLength: 50,
    finalTimeMs,
    splits: [
      { distance: 50, cumulativeTimeMs: first },
      { distance: 100, cumulativeTimeMs: finalTimeMs },
    ],
    isRelay: false,
    reasonCode: 0,
    validationStatus: "valid",
    validationReason: null,
    ...over,
  };
}

/** 同一 bucket に n 件。ratio を散らして percentile を検証できるようにする */
function sameBucket(n: number, base = 50000): RawRace[] {
  return Array.from({ length: n }, (_, i) => {
    const finalTimeMs = base + (i % 5) * 10; // 50.00〜50.04 -> 全て 50000-50499 bucket
    const firstRatio = 0.46 + (i % 5) * 0.01; // 0.46..0.50
    return race({
      finalTimeMs,
      splits: [
        { distance: 50, cumulativeTimeMs: Math.round(finalTimeMs * firstRatio) },
        { distance: 100, cumulativeTimeMs: finalTimeMs },
      ],
    });
  });
}

describe("toPoolType", () => {
  it("[V-A5] 50m -> 1 (長水路), 25m -> 0 (短水路)", () => {
    expect(toPoolType(50)).toBe(1);
    expect(toPoolType(25)).toBe(0);
  });
});

describe("isAggregatable", () => {
  it("[V-A3] valid かつ非リレーのみ通す", () => {
    expect(isAggregatable(race())).toBe(true);
    expect(isAggregatable(race({ validationStatus: "disqualified" }))).toBe(false);
    expect(isAggregatable(race({ validationStatus: "lap_mismatch" }))).toBe(false);
    expect(isAggregatable(race({ isRelay: true }))).toBe(false);
    expect(isAggregatable(race({ finalTimeMs: null }))).toBe(false);
    expect(isAggregatable(race({ gender: "unknown" }))).toBe(false);
    expect(isAggregatable(race({ stroke: "unknown" }))).toBe(false);
    expect(isAggregatable(race({ splits: [] }))).toBe(false);
  });
});

describe("aggregate", () => {
  it("[V-A4] minSampleCount 未満は出力しない", () => {
    expect(aggregate(sameBucket(29))).toEqual([]);
    expect(aggregate(sameBucket(30))).toHaveLength(1);
  });

  it("[V-A4] 閾値は上書きできる", () => {
    expect(aggregate(sameBucket(3), { minSampleCount: 3 })).toHaveLength(1);
  });

  it("[V-A1] bucket 境界でグループが分かれる", () => {
    // 幅を明示して境界の振る舞いを検証する (既定値の変更に影響されないよう)。
    // 0.5秒幅なら 50.10 と 50.60 は別 bucket
    const races = [
      ...Array.from({ length: 5 }, () => race({ finalTimeMs: 50100 })),
      ...Array.from({ length: 5 }, () => race({ finalTimeMs: 50600 })),
    ];
    const models = aggregate(races, { minSampleCount: 1, bucketConfig: { 100: 500 } });
    expect(models).toHaveLength(2);
    expect(models.map((m) => m.minTimeMs)).toEqual([50000, 50500]);
    expect(models.every((m) => m.sampleCount === 5)).toBe(true);
  });

  it("[V-A1] 既定幅 (1.0秒) では同一 bucket にまとまる", () => {
    const races = [
      ...Array.from({ length: 5 }, () => race({ finalTimeMs: 50100 })),
      ...Array.from({ length: 5 }, () => race({ finalTimeMs: 50600 })),
    ];
    const models = aggregate(races, { minSampleCount: 1 });
    expect(models).toHaveLength(1);
    // toHaveLength(1) で models が1件以上であることを検証済み
    expect(models[0]!.sampleCount).toBe(10);
  });

  it("[V-A1] gender / pool / stroke / distance でグループが分かれる", () => {
    const races = [
      race(),
      race({ gender: "female" }),
      race({ poolLength: 25 }),
      race({ stroke: "Br" }),
      race({
        distance: 200,
        finalTimeMs: 120000,
        splits: [
          { distance: 50, cumulativeTimeMs: 28000 },
          { distance: 100, cumulativeTimeMs: 58000 },
          { distance: 150, cumulativeTimeMs: 89000 },
          { distance: 200, cumulativeTimeMs: 120000 },
        ],
      }),
    ];
    expect(aggregate(races, { minSampleCount: 1 })).toHaveLength(5);
  });

  it("[V-A2] median / p25 / p75 が比率サンプルから正しく出る", () => {
    // 第1LAP比率を 0.46,0.47,0.48,0.49,0.50 で1件ずつ
    const races = [0.46, 0.47, 0.48, 0.49, 0.5].map((r) =>
      race({
        finalTimeMs: 50000,
        splits: [
          { distance: 50, cumulativeTimeMs: Math.round(50000 * r) },
          { distance: 100, cumulativeTimeMs: 50000 },
        ],
      }),
    );
    // race() は必ず50/100の2 split を持つため、aggregate は1件・2 lap のモデルを返す
    const m = aggregate(races, { minSampleCount: 1 })[0]!;
    expect(m.sampleCount).toBe(5);
    const lap0 = m.laps[0]!;
    const lap1 = m.laps[1]!;
    expect(lap0.ratioMedian).toBeCloseTo(0.48, 6);
    expect(lap0.ratioP25).toBeCloseTo(0.47, 6);
    expect(lap0.ratioP75).toBeCloseTo(0.49, 6);
    // 第2LAP は残り。合計は1
    expect(lap0.ratioMedian + lap1.ratioMedian).toBeCloseTo(1, 6);
  });

  it("[V-A2] LAP距離と本数が保たれる", () => {
    // sameBucket は30件の100m/50・100 split レースを返すため必ず1件のモデルになる
    const m = aggregate(sameBucket(30))[0]!;
    expect(m.laps.map((l) => l.distance)).toEqual([50, 100]);
    expect(m.splitInterval).toBe(50);
  });

  it("[V-A2] 区間タイムの平均/中央値も出す", () => {
    const m = aggregate(sameBucket(30))[0]!;
    const lap0 = m.laps[0]!;
    expect(lap0.lapTimeMeanMs).toBeGreaterThan(0);
    expect(lap0.lapTimeMedianMs).toBeGreaterThan(0);
    expect(Number.isInteger(lap0.lapTimeMeanMs)).toBe(true);
  });

  it("[V-A3] リレー/DSQ/欠損は混ざらない", () => {
    const races = [
      ...sameBucket(30),
      ...Array.from({ length: 50 }, () => race({ isRelay: true })),
      ...Array.from({ length: 50 }, () => race({ validationStatus: "disqualified" })),
      ...Array.from({ length: 50 }, () => race({ finalTimeMs: null })),
    ];
    const models = aggregate(races);
    expect(models).toHaveLength(1);
    expect(models[0]!.sampleCount).toBe(30);
  });

  it("[V-A5] pool_type が 0|1 で出る (25|50 は出さない)", () => {
    const models = aggregate([...sameBucket(30), ...sameBucket(30).map((r) => ({ ...r, poolLength: 25 as const }))], {
      minSampleCount: 30,
    });
    expect(new Set(models.map((m) => m.poolType))).toEqual(new Set([0, 1]));
  });

  it("[V-A6] 既定では学種で分けない", () => {
    const races = [
      ...sameBucket(15).map((r) => ({ ...r, ageCategory: "大学" })),
      ...sameBucket(15).map((r) => ({ ...r, ageCategory: "高校" })),
    ];
    const models = aggregate(races, { minSampleCount: 30 });
    expect(models).toHaveLength(1);
    expect(models[0]!.ageCategory).toBe("all");
    expect(models[0]!.sampleCount).toBe(30);
  });

  it("[V-A6] school_class モードでは学種ごとに分かれる", () => {
    const races = [
      ...sameBucket(15).map((r) => ({ ...r, ageCategory: "大学" })),
      ...sameBucket(15).map((r) => ({ ...r, ageCategory: "高校" })),
    ];
    const models = aggregate(races, { minSampleCount: 15, ageCategoryMode: "school_class" });
    expect(models).toHaveLength(2);
    expect(new Set(models.map((m) => m.ageCategory))).toEqual(new Set(["大学", "高校"]));
  });

  it("[V-A7] 出力順が決定的", () => {
    const races = [
      ...Array.from({ length: 5 }, () => race({ finalTimeMs: 50600 })),
      ...Array.from({ length: 5 }, () => race({ finalTimeMs: 50100 })),
      ...Array.from({ length: 5 }, () => race({ gender: "female", finalTimeMs: 50100 })),
    ];
    const a = aggregate(races, { minSampleCount: 1 });
    const b = aggregate([...races].reverse(), { minSampleCount: 1 });
    expect(a.map((m) => [m.gender, m.minTimeMs])).toEqual(b.map((m) => [m.gender, m.minTimeMs]));
    expect(a[0]!.gender).toBe("female");
  });

  it("[V-A1] bucket 幅の設定を差し替えられる", () => {
    const races = [race({ finalTimeMs: 50100 }), race({ finalTimeMs: 50300 })];
    const wide = aggregate(races, { minSampleCount: 1 });
    const narrow = aggregate(races, { minSampleCount: 1, bucketConfig: { 100: 100 } });
    expect(wide).toHaveLength(1);
    expect(narrow).toHaveLength(2);
  });

  it("空入力で落ちない", () => {
    expect(aggregate([])).toEqual([]);
  });
});

describe("aggregate - 情報量ゼロのモデルを出さない", () => {
  /** 50m は LAP が1本 (ゴールのみ) しか取れない */
  function race50(finalTimeMs: number): RawRace {
    return {
      sourceRaceId: Math.random().toString(36).slice(2),
      sourceUrl: "https://example.test/r",
      gender: "female",
      stroke: "Fr",
      distance: 50,
      poolLength: 50,
      finalTimeMs,
      splits: [{ distance: 50, cumulativeTimeMs: finalTimeMs }],
      isRelay: false,
      reasonCode: 0,
      validationStatus: "valid",
      validationReason: null,
    };
  }

  it("LAP が1本しかないグループ (50m) はモデルにしない", () => {
    const races = Array.from({ length: 40 }, (_, i) => race50(28600 + (i % 3) * 10));
    // 集計対象としては valid だが、比率が必ず 1.0 になり情報量がない
    expect(races.every((r) => isAggregatable(r))).toBe(true);
    expect(aggregate(races, { minSampleCount: 1 })).toEqual([]);
  });

  it("LAP が2本以上あれば出す (100m は残る)", () => {
    expect(aggregate(sameBucket(30), { minSampleCount: 1 })).toHaveLength(1);
  });
});
