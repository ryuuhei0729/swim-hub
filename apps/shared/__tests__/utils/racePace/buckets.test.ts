// =============================================================================
// buckets.test.ts - time bucket 生成 と 統計関数
// =============================================================================
// 検証観点:
//   [V-B1] TIME_BUCKET_CONFIG が ms 単位で距離ごとに設定でき、後から変更できる
//   [V-B2] bucket 境界が仕様例 (100m/0.5秒刻み: 49.00〜49.49) と一致する
//   [V-B3] 境界値がどちらか一方の bucket にのみ属する (重複も隙間もない)
//   [V-B4] median/percentile が DuckDB quantile_cont と同じ線形補間定義である
//   [V-B5] LAP比率 = lap_time / final_time であり合計が1になる
// =============================================================================

import { describe, expect, it } from "vitest";
import {
  TIME_BUCKET_CONFIG,
  getBucketWidthMs,
  getTimeBucket,
} from "../../../utils/racePace/buckets";
import { mean, median, percentile } from "../../../utils/racePace/stats";
import { lapRatios } from "../../../utils/racePace/ratios";

describe("time bucket", () => {
  it("[V-B1] 既定の bucket 幅 (変更は意図的に行うこと)", () => {
    // 実データ32,631件の計測で 0.5秒 -> 1.0秒 に変更した。
    // カバレッジ 80 -> 212モデル、ばらつき増加は 3.5% のみ。
    // ここを変えるときは同種の実測根拠を伴わせる。
    expect(TIME_BUCKET_CONFIG[100]).toBe(1000);
    expect(TIME_BUCKET_CONFIG[200]).toBe(2000);
    expect(TIME_BUCKET_CONFIG[400]).toBe(4000);
    // 距離が伸びるほど幅も広い (単調)
    const ds = Object.keys(TIME_BUCKET_CONFIG).map(Number).sort((a, b) => a - b);
    for (let i = 1; i < ds.length; i++) {
      expect(TIME_BUCKET_CONFIG[ds[i]]).toBeGreaterThanOrEqual(TIME_BUCKET_CONFIG[ds[i - 1]]);
    }
  });

  it("[V-B1] 未設定の距離もフォールバック幅を返す (crash しない)", () => {
    expect(getBucketWidthMs(800)).toBeGreaterThan(0);
    expect(getBucketWidthMs(1500)).toBeGreaterThan(0);
    expect(getBucketWidthMs(333)).toBeGreaterThan(0);
  });

  it("[V-B1] 設定を差し替えれば bucket 幅が変わる (ハードコードされていない)", () => {
    expect(getBucketWidthMs(100, { 100: 100 })).toBe(100);
    expect(getBucketWidthMs(100, { 100: 500 })).toBe(500);
  });

  // 境界計算そのものの検証は幅を明示して行う (既定値の変更に影響されないよう)
  const HALF_SEC = { 100: 500 };

  it("[V-B2] 仕様例どおりの境界を返す (100m, 0.5秒刻み)", () => {
    const b = getTimeBucket(49000, 100, HALF_SEC);
    expect(b.minTimeMs).toBe(49000);
    expect(b.maxTimeMs).toBe(49499);
    expect(getTimeBucket(49490, 100, HALF_SEC).minTimeMs).toBe(49000);
    expect(getTimeBucket(49500, 100, HALF_SEC).minTimeMs).toBe(49500);
    expect(getTimeBucket(50250, 100, HALF_SEC).minTimeMs).toBe(50000);
    expect(getTimeBucket(50250, 100, HALF_SEC).maxTimeMs).toBe(50499);
  });

  it("[V-B2] center は bucket の中央", () => {
    expect(getTimeBucket(49000, 100, HALF_SEC).centerTimeMs).toBe(49250);
    expect(getTimeBucket(49000, 100, { 100: 1000 }).centerTimeMs).toBe(49500);
  });

  it("[V-B3] 隣接 bucket に重複も隙間もない", () => {
    for (const width of [250, 500, 1000, 2000]) {
      const cfg = { 100: width };
      const a = getTimeBucket(49000, 100, cfg);
      const next = getTimeBucket(a.maxTimeMs + 1, 100, cfg);
      expect(next.minTimeMs, `width=${width}`).toBe(a.maxTimeMs + 1);
    }
  });

  it("[V-B3] 境界値が別 bucket に落ちる", () => {
    expect(getTimeBucket(49499, 100, HALF_SEC).minTimeMs).toBe(49000);
    expect(getTimeBucket(49500, 100, HALF_SEC).minTimeMs).toBe(49500);
    // 既定 (1.0秒) では 49499 と 49500 は同じ bucket になる
    expect(getTimeBucket(49499, 100).minTimeMs).toBe(getTimeBucket(49500, 100).minTimeMs);
  });
});

describe("stats", () => {
  it("median は奇数長で中央値", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("median は偶数長で平均", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("[V-B4] percentile は線形補間 (DuckDB quantile_cont と同じ定義)", () => {
    // xs=[1,2,3,4], p=0.25 -> 位置 = 0.25*(4-1) = 0.75 -> 1 + 0.75*(2-1) = 1.75
    expect(percentile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75, 10);
    expect(percentile([1, 2, 3, 4], 0.75)).toBeCloseTo(3.25, 10);
    expect(percentile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 10);
    expect(percentile([1, 2, 3, 4], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4], 1)).toBe(4);
  });

  it("percentile は未ソート入力でも正しい", () => {
    expect(percentile([4, 1, 3, 2], 0.25)).toBeCloseTo(1.75, 10);
  });

  it("空配列は null (0 を返して統計を汚さない)", () => {
    expect(median([])).toBeNull();
    expect(percentile([], 0.5)).toBeNull();
    expect(mean([])).toBeNull();
  });
});

describe("lapRatios", () => {
  it("[V-B5] 仕様例の比率を返す", () => {
    // final 50.00, laps 11.50/12.50/12.80/13.20 -> 23.0/25.0/25.6/26.4%
    const r = lapRatios([11500, 12500, 12800, 13200], 50000);
    expect(r).toEqual([0.23, 0.25, 0.256, 0.264]);
  });

  it("[V-B5] 比率の合計は 1", () => {
    const r = lapRatios([23740, 25780], 49520);
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("final が 0 以下なら空 (0除算しない)", () => {
    expect(lapRatios([100], 0)).toEqual([]);
  });
});
