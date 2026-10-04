/**
 * computeGoalProgress の仕様固定 (Sprint Contract v1 S6)。
 *
 * 達成率 = (start - best) / (start - target) * 100 を 0〜100 にクランプ。
 * 本人画面 (GoalAPI.calculateGoalProgress) と同値であることが要件:
 *   - best なし (null) → 0 / best が falsy (0) → 0 (time=0 は TS 側で 0 扱い)
 *   - start NULL → 0
 *   - target >= start → 0
 * 期待値はすべて手計算した定数。式を実装側からコピーしていない。
 */
import { describe, expect, it } from "vitest";
import { computeGoalProgress } from "../../utils/goalProgress";

const p = (startTime: number | null, targetTime: number, currentBestTime: number | null) =>
  computeGoalProgress({ startTime, targetTime, currentBestTime });

describe("computeGoalProgress", () => {
  describe("通常の計算", () => {
    it("start=70 target=60 best=65 は 50", () => {
      expect(p(70, 60, 65)).toBe(50);
    });
    it("start=62 target=58 best=61 は 25", () => {
      expect(p(62, 58, 61)).toBeCloseTo(25, 10);
    });
    it("best が start と同じなら 0", () => {
      expect(p(70, 60, 70)).toBe(0);
    });
    it("best が target と同じなら 100", () => {
      expect(p(70, 60, 60)).toBe(100);
    });
  });

  describe("クランプ", () => {
    it("best が target を超えて速い場合は 100 (超過しない)", () => {
      expect(p(70, 60, 50)).toBe(100);
    });
    it("best が start より遅い (悪化) 場合は 0 (負にならない)", () => {
      expect(p(70, 60, 80)).toBe(0);
    });
  });

  describe("本人画面と同値のフォールバック", () => {
    it("currentBestTime が null なら 0 (ベストなし)", () => {
      expect(p(70, 60, null)).toBe(0);
    });
    it("currentBestTime が 0 なら 0 (falsy は記録なし扱い。100 にしてはいけない)", () => {
      expect(p(70, 60, 0)).toBe(0);
    });
    it("startTime が null なら 0", () => {
      expect(p(null, 60, 65)).toBe(0);
    });
    it("target > start (目標が初期タイムより遅い) なら 0", () => {
      expect(p(60, 70, 55)).toBe(0);
    });
    it("target === start (分母 0) なら 0。NaN / Infinity にならない", () => {
      const r = p(60, 60, 55);
      expect(r).toBe(0);
      expect(Number.isFinite(r)).toBe(true);
    });
    it("startTime が 0 は「初期タイムなし」扱いで 0 (本人画面の !start_time と同値)", () => {
      expect(p(0, 60, 65)).toBe(0);
    });
  });

  describe("戻り値の範囲 (網羅)", () => {
    it.each([
      [70, 60, 65],
      [70, 60, 50],
      [70, 60, 90],
      [60, 70, 65],
      [60, 60, 60],
      [null, 60, 60],
      [70, 60, null],
    ] as const)("start=%s target=%s best=%s は 0 以上 100 以下", (s, t, b) => {
      const r = p(s, t, b);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(100);
    });
  });
});
