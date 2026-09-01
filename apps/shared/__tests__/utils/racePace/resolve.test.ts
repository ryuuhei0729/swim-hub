// =============================================================================
// resolve.test.ts - 条件に合うモデルを選び、必要なら bucket 間を補間する
// =============================================================================
// 検証観点:
//   [V-R1] 目標タイムを含む bucket があればそれを使う (source=exact)
//   [V-R2] bucket の隙間に落ちたら両隣を線形補間する (source=interpolated)
//   [V-R3] 範囲外は端のモデルにクランプする (source=nearest / 外挿しない)
//   [V-R4] 該当なしは null (捏造しない)
//   [V-R5] どのモデルを使ったか呼び出し側が判別できる
//   [V-R6] 補間しても sum(lapTimeMs) === targetTimeMs が保たれる
//   [V-R7] 補間を無効化できる (strategy=exact)
// =============================================================================

import { describe, expect, it } from "vitest";
import { resolveTargetLaps } from "../../../utils/racePace/resolve";
import type { RacePaceModel } from "../../../utils/racePace/types";

const model = (minTimeMs: number, maxTimeMs: number, firstRatio: number, sampleCount = 40): RacePaceModel => ({
  gender: "male",
  poolType: 1,
  stroke: "fr",
  distance: 100,
  splitInterval: 50,
  ageCategory: "all",
  minTimeMs,
  maxTimeMs,
  centerTimeMs: Math.floor((minTimeMs + maxTimeMs) / 2),
  sampleCount,
  laps: [
    { distance: 50, ratioMedian: firstRatio, ratioP25: firstRatio - 0.005, ratioP75: firstRatio + 0.005 },
    { distance: 100, ratioMedian: 1 - firstRatio, ratioP25: 0, ratioP75: 0 },
  ],
});

// 51.00〜51.99 / 52.00〜52.99 / 54.00〜54.99 (53秒台が欠けている)
const models = [
  model(51000, 51999, 0.475),
  model(52000, 52999, 0.48),
  model(54000, 54999, 0.49),
];

describe("resolveTargetLaps", () => {
  it("[V-R1][V-R5] 目標を含む bucket をそのまま使う", () => {
    const r = resolveTargetLaps({ models, targetTimeMs: 52500 });
    expect(r).not.toBeNull();
    expect(r!.source).toBe("exact");
    // resolveTargetLaps は model.laps.length > 0 のときだけ build() を呼ぶため常に1件以上返す
    expect(r!.laps[0]!.lapTimeMs).toBe(Math.round(52500 * 0.48 / 10) * 10);
    expect(r!.sampleCount).toBe(40);
  });

  it("[V-R2] bucket の隙間 (53秒台) は両隣を補間する", () => {
    const r = resolveTargetLaps({ models, targetTimeMs: 53500 });
    expect(r!.source).toBe("interpolated");
    // 52.5 の 0.48 と 54.5 の 0.49 の中間 = 0.485 付近
    const ratio = r!.laps[0]!.lapTimeMs / 53500; // laps は常に1件以上
    expect(ratio).toBeGreaterThan(0.48);
    expect(ratio).toBeLessThan(0.49);
    // 両隣のサンプルを合算して報告する
    expect(r!.sampleCount).toBe(80);
  });

  it("[V-R3] 範囲より速い目標は最速 bucket にクランプする (外挿しない)", () => {
    const r = resolveTargetLaps({ models, targetTimeMs: 45000 });
    expect(r!.source).toBe("nearest");
    expect(r!.laps[0]!.lapTimeMs / 45000).toBeCloseTo(0.475, 3); // laps は常に1件以上
  });

  it("[V-R3] 範囲より遅い目標は最遅 bucket にクランプする", () => {
    const r = resolveTargetLaps({ models, targetTimeMs: 70000 });
    expect(r!.source).toBe("nearest");
    expect(r!.laps[0]!.lapTimeMs / 70000).toBeCloseTo(0.49, 3); // laps は常に1件以上
  });

  it("[V-R4] モデルが無ければ null", () => {
    expect(resolveTargetLaps({ models: [], targetTimeMs: 52000 })).toBeNull();
  });

  it("[V-R4] 目標タイムが 0 以下なら null", () => {
    expect(resolveTargetLaps({ models, targetTimeMs: 0 })).toBeNull();
  });

  it("[V-R5] 使用したモデルの bucket を返す", () => {
    const r = resolveTargetLaps({ models, targetTimeMs: 52500 });
    expect(r!.usedBuckets).toEqual([{ minTimeMs: 52000, maxTimeMs: 52999 }]);
    const i = resolveTargetLaps({ models, targetTimeMs: 53500 });
    expect(i!.usedBuckets).toHaveLength(2);
  });

  it("[V-R6] どの経路でも合計が目標と厳密に一致する", () => {
    for (const target of [45000, 51500, 52500, 53500, 54500, 70000, 52501]) {
      const r = resolveTargetLaps({ models, targetTimeMs: target });
      expect(r!.laps.reduce((a, l) => a + l.lapTimeMs, 0), `target=${target}`).toBe(target);
      // laps は常に1件以上
      expect(r!.laps[r!.laps.length - 1]!.cumulativeTimeMs, `target=${target}`).toBe(target);
    }
  });

  it("[V-R7] strategy=exact なら補間せず、隙間は null", () => {
    expect(resolveTargetLaps({ models, targetTimeMs: 52500, strategy: "exact" })!.source).toBe("exact");
    expect(resolveTargetLaps({ models, targetTimeMs: 53500, strategy: "exact" })).toBeNull();
  });

  it("モデルが1件でも動く", () => {
    const one = [model(52000, 52999, 0.48)];
    expect(resolveTargetLaps({ models: one, targetTimeMs: 52500 })!.source).toBe("exact");
    expect(resolveTargetLaps({ models: one, targetTimeMs: 60000 })!.source).toBe("nearest");
  });

  it("入力順に依存しない", () => {
    const a = resolveTargetLaps({ models, targetTimeMs: 53500 });
    const b = resolveTargetLaps({ models: [...models].reverse(), targetTimeMs: 53500 });
    expect(a!.laps).toEqual(b!.laps);
  });

  it("LAP本数が違うモデルが混ざっていても壊れない", () => {
    // models は固定3要素のモジュールスコープ定数のため常に存在する
    const mixed = [
      models[0]!,
      { ...models[1]!, laps: [{ distance: 100, ratioMedian: 1, ratioP25: 0, ratioP75: 0 }] },
    ];
    const r = resolveTargetLaps({ models: mixed, targetTimeMs: 51500 });
    expect(r!.laps).toHaveLength(2);
  });
});
