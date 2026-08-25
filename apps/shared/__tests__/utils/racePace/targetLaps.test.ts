// =============================================================================
// targetLaps.test.ts - 目標タイム -> 理想LAP 生成
// =============================================================================
// 検証観点:
//   [V-G1] 対象 bucket の median LAP ratio から LAP を生成する
//   [V-G2] sum(lapTimeMs) === targetTimeMs を必ず満たす (丸め誤差を最終LAPで吸収)
//   [V-G3] centisecond 表示粒度でも合計が一致する (UI が numeric(10,2) 秒で丸めるため)
//   [V-G4] cumulativeTimeMs が単調増加し、最後が targetTimeMs と一致する
//   [V-G5] 比率の合計が1でないモデル (欠損/丸め済み) でも合計保証が壊れない
//   [V-G6] bucket 間の線形補間ができる
//   [V-G7] sampleCount をそのまま返す
// =============================================================================

import { describe, expect, it } from "vitest";
import {
  generateTargetLaps,
  interpolateLapRatios,
} from "../../../utils/racePace/targetLaps";
import type { RacePaceModel } from "../../../utils/racePace/types";

// 仕様例のモデル: 男子/長水路/自由形/100m, 50.00〜50.49
const model100fr: RacePaceModel = {
  gender: "male",
  poolType: 1,
  stroke: "fr",
  distance: 100,
  splitInterval: 50,
  ageCategory: "all",
  minTimeMs: 50000,
  maxTimeMs: 50499,
  centerTimeMs: 50250,
  sampleCount: 1234,
  laps: [
    { distance: 50, ratioMedian: 0.48, ratioP25: 0.475, ratioP75: 0.485 },
    { distance: 100, ratioMedian: 0.52, ratioP25: 0.515, ratioP75: 0.525 },
  ],
};

describe("generateTargetLaps", () => {
  it("[V-G1][V-G4] median ratio から LAP と累積を生成する", () => {
    const out = generateTargetLaps({ targetTimeMs: 50000, model: model100fr });
    expect(out.laps.map((l) => l.distance)).toEqual([50, 100]);
    expect(out.laps[0].lapTimeMs).toBe(24000);
    expect(out.laps[1].lapTimeMs).toBe(26000);
    expect(out.laps.map((l) => l.cumulativeTimeMs)).toEqual([24000, 50000]);
    expect(out.targetTimeMs).toBe(50000);
  });

  it("[V-G7] sampleCount を返す", () => {
    expect(generateTargetLaps({ targetTimeMs: 50000, model: model100fr }).sampleCount).toBe(1234);
  });

  it("[V-G2] 端数の出る目標でも合計が厳密に一致する", () => {
    for (const target of [50250, 49999, 50001, 47777, 123457]) {
      const out = generateTargetLaps({ targetTimeMs: target, model: model100fr });
      const sum = out.laps.reduce((a, l) => a + l.lapTimeMs, 0);
      expect(sum, `target=${target}`).toBe(target);
      expect(out.laps[out.laps.length - 1].cumulativeTimeMs, `target=${target}`).toBe(target);
    }
  });

  it("[V-G2][V-G4] 累積は単調増加する", () => {
    const model = {
      ...model100fr,
      distance: 400,
      laps: [50, 100, 150, 200, 250, 300, 350, 400].map((distance, i) => ({
        distance,
        ratioMedian: [0.114, 0.126, 0.128, 0.129, 0.128, 0.127, 0.126, 0.122][i],
        ratioP25: 0,
        ratioP75: 0,
      })),
    };
    const out = generateTargetLaps({ targetTimeMs: 229310, model });
    const cums = out.laps.map((l) => l.cumulativeTimeMs);
    for (let i = 1; i < cums.length; i++) expect(cums[i]).toBeGreaterThan(cums[i - 1]);
    expect(cums[cums.length - 1]).toBe(229310);
    expect(out.laps.reduce((a, l) => a + l.lapTimeMs, 0)).toBe(229310);
  });

  it("[V-G3] centisecond 粒度でも合計が一致する (既定粒度)", () => {
    // 既定 granularity=10ms。各LAPが 10ms の倍数で、合計が target に一致すること。
    const out = generateTargetLaps({ targetTimeMs: 50250, model: model100fr });
    const nonFinal = out.laps.slice(0, -1);
    for (const l of nonFinal) expect(l.lapTimeMs % 10).toBe(0);
    expect(out.laps.reduce((a, l) => a + l.lapTimeMs, 0)).toBe(50250);
  });

  it("[V-G3] granularity=1 を指定すれば ms 単位で配分する", () => {
    const out = generateTargetLaps({ targetTimeMs: 50007, model: model100fr, granularityMs: 1 });
    expect(out.laps.reduce((a, l) => a + l.lapTimeMs, 0)).toBe(50007);
  });

  it("[V-G5] 比率の合計が1でないモデルでも合計保証が壊れない", () => {
    const skewed: RacePaceModel = {
      ...model100fr,
      laps: [
        { distance: 50, ratioMedian: 0.4, ratioP25: 0, ratioP75: 0 },
        { distance: 100, ratioMedian: 0.4, ratioP25: 0, ratioP75: 0 },
      ],
    };
    const out = generateTargetLaps({ targetTimeMs: 50000, model: skewed });
    expect(out.laps.reduce((a, l) => a + l.lapTimeMs, 0)).toBe(50000);
    // 正規化されるので前半が極端に短くならない
    expect(out.laps[0].lapTimeMs).toBeGreaterThan(20000);
  });

  it("LAP が無いモデルは空の laps を返す (throw しない)", () => {
    const out = generateTargetLaps({ targetTimeMs: 50000, model: { ...model100fr, laps: [] } });
    expect(out.laps).toEqual([]);
  });

  it("目標タイムが 0 以下なら空", () => {
    expect(generateTargetLaps({ targetTimeMs: 0, model: model100fr }).laps).toEqual([]);
  });
});

describe("interpolateLapRatios", () => {
  const low: RacePaceModel = {
    ...model100fr,
    minTimeMs: 49500, maxTimeMs: 49999, centerTimeMs: 49750,
    laps: [
      { distance: 50, ratioMedian: 0.47, ratioP25: 0, ratioP75: 0 },
      { distance: 100, ratioMedian: 0.53, ratioP25: 0, ratioP75: 0 },
    ],
  };
  const high: RacePaceModel = {
    ...model100fr,
    minTimeMs: 50000, maxTimeMs: 50499, centerTimeMs: 50250,
    laps: [
      { distance: 50, ratioMedian: 0.49, ratioP25: 0, ratioP75: 0 },
      { distance: 100, ratioMedian: 0.51, ratioP25: 0, ratioP75: 0 },
    ],
  };

  it("[V-G6] 2モデルの中間で線形補間する", () => {
    const mid = interpolateLapRatios(low, high, 50000);
    expect(mid[0].ratioMedian).toBeCloseTo(0.48, 10);
    expect(mid[1].ratioMedian).toBeCloseTo(0.52, 10);
  });

  it("[V-G6] center と一致する目標では該当モデルの値になる", () => {
    expect(interpolateLapRatios(low, high, 49750)[0].ratioMedian).toBeCloseTo(0.47, 10);
    expect(interpolateLapRatios(low, high, 50250)[0].ratioMedian).toBeCloseTo(0.49, 10);
  });

  it("[V-G6] 範囲外は端のモデルにクランプする (外挿しない)", () => {
    expect(interpolateLapRatios(low, high, 40000)[0].ratioMedian).toBeCloseTo(0.47, 10);
    expect(interpolateLapRatios(low, high, 90000)[0].ratioMedian).toBeCloseTo(0.49, 10);
  });

  it("[V-G6] 補間した比率で生成しても合計保証が保たれる", () => {
    const laps = interpolateLapRatios(low, high, 50000);
    const out = generateTargetLaps({ targetTimeMs: 50000, model: { ...high, laps } });
    expect(out.laps.reduce((a, l) => a + l.lapTimeMs, 0)).toBe(50000);
  });
});
