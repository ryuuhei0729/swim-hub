// =============================================================================
// splitTimesEvery50m.logic.test.ts
// Task #20: handleAddSplitTimesEvery50m のコアロジック検証
// Sprint Contract V-01〜V-06 対応
// =============================================================================

import { describe, it, expect } from "vitest";
import { FREE_PLAN_LIMITS } from "@apps/shared/constants/premium";

// ============================================================
// ピュア関数として抽出したコアロジック
// RecordFormScreen.tsx 行 518-552 / RecordLogFormScreen.tsx 行 354-388 と等価
// ============================================================

const FREE_SPLIT_LIMIT = FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD;

type SplitTime = { distance: number; splitTime: number };

/**
 * handleAddSplitTimesEvery50m のコアロジックをピュア関数化
 * @param raceDistance  種目の距離 (null = 未選択)
 * @param splitTimes    現在のスプリットタイム一覧
 * @param isPremium     プレミアムユーザーか
 * @returns 追加後のスプリットタイム一覧 (追加なし時は null)
 */
function computeAddSplitTimesEvery50m(
  raceDistance: number | null,
  splitTimes: SplitTime[],
  isPremium: boolean,
): SplitTime[] | null {
  if (!raceDistance) return null;

  const existingDistances = new Set(
    splitTimes
      .map((st) =>
        typeof st.distance === "number" ? st.distance : parseFloat(String(st.distance)) || 0,
      )
      .filter((d) => d > 0),
  );

  const newSplits: SplitTime[] = [];
  for (let distance = 50; distance <= raceDistance; distance += 50) {
    if (!existingDistances.has(distance)) {
      newSplits.push({ distance, splitTime: 0 });
    }
  }

  if (newSplits.length === 0) return null;

  let splitsToAdd = newSplits;
  if (!isPremium) {
    const remaining = FREE_SPLIT_LIMIT - splitTimes.length;
    if (remaining <= 0) return null;
    splitsToAdd = newSplits.slice(0, remaining);
  }

  return [...splitTimes, ...splitsToAdd];
}

// ============================================================
// テスト
// ============================================================

describe("handleAddSplitTimesEvery50m コアロジック", () => {
  // --- V-01/V-02: 100m 種目 ---
  describe("V-02: 100m 種目でタップすると 50m, 100m の 2 件が追加される", () => {
    it("プレミアムユーザー: splitTimes 空 → [50, 100] が追加される", () => {
      const result = computeAddSplitTimesEvery50m(100, [], true);
      expect(result).not.toBeNull();
      expect(result!.map((s) => s.distance)).toEqual([50, 100]);
    });

    it("フリーユーザー・上限未達: splitTimes 空 → FREE_PLAN_LIMIT(3) まで追加される", () => {
      // 100m なら 50m, 100m の 2 件。上限 3 > 2 なので全件追加
      const result = computeAddSplitTimesEvery50m(100, [], false);
      expect(result).not.toBeNull();
      expect(result!.map((s) => s.distance)).toEqual([50, 100]);
    });
  });

  // --- V-03: 50m 種目 ---
  describe("V-03: 50m 種目でタップすると 50m の 1 件のみ追加される", () => {
    it("splitTimes 空 → [50] のみ追加", () => {
      const result = computeAddSplitTimesEvery50m(50, [], true);
      expect(result).not.toBeNull();
      expect(result!.map((s) => s.distance)).toEqual([50]);
    });

    it("100m を期待した値が来ないこと", () => {
      const result = computeAddSplitTimesEvery50m(50, [], true);
      expect(result!.some((s) => s.distance === 100)).toBe(false);
    });
  });

  // --- V-04: 25m 種目 ---
  describe("V-04: 25m 種目でタップすると何も追加されない", () => {
    it("raceDistance=25 → ループが 1 回も通過しないため null を返す", () => {
      // 25m 種目: distance=50 から開始するループは 50 <= 25 が偽なので 0 回
      const result = computeAddSplitTimesEvery50m(25, [], true);
      expect(result).toBeNull();
    });
  });

  // --- V-05: 既存 50m あり状態で重複追加されない ---
  describe("V-05: 既存 50m がある場合は重複追加されない", () => {
    it("100m 種目で 50m が既存 → 100m のみ追加", () => {
      const existing: SplitTime[] = [{ distance: 50, splitTime: 28.5 }];
      const result = computeAddSplitTimesEvery50m(100, existing, true);
      expect(result).not.toBeNull();
      const addedDistances = result!.map((s) => s.distance);
      expect(addedDistances).toContain(100);
      expect(addedDistances.filter((d) => d === 50)).toHaveLength(1); // 50m は 1 件のみ
    });

    it("100m 種目で 50m, 100m ともに既存 → 何も追加されない", () => {
      const existing: SplitTime[] = [
        { distance: 50, splitTime: 28.5 },
        { distance: 100, splitTime: 58.0 },
      ];
      const result = computeAddSplitTimesEvery50m(100, existing, true);
      expect(result).toBeNull();
    });
  });

  // --- V-06: Free プラン上限 (splitTimes.length >= 3) 時は追加されない ---
  describe("V-06: Free プラン上限到達時は追加されない", () => {
    it("splitTimes.length === 3 (上限到達) → null を返す", () => {
      const existing: SplitTime[] = [
        { distance: 25, splitTime: 14.0 },
        { distance: 50, splitTime: 28.5 },
        { distance: 75, splitTime: 43.0 },
      ];
      const result = computeAddSplitTimesEvery50m(100, existing, false);
      expect(result).toBeNull();
    });

    it("splitTimes.length === 2 → 残り 1 件まで追加される", () => {
      // remaining = 3 - 2 = 1 → 50m, 100m のうち先頭 1 件 (50m) のみ追加
      const existing: SplitTime[] = [
        { distance: 25, splitTime: 14.0 },
        { distance: 75, splitTime: 43.0 },
      ];
      const result = computeAddSplitTimesEvery50m(100, existing, false);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(3); // 既存 2 + 追加 1
    });

    it("splitTimes.length === 0, isPremium=false → 全 50m 刻みを追加 (2 件)", () => {
      const result = computeAddSplitTimesEvery50m(100, [], false);
      expect(result).not.toBeNull();
      // 100m → 50m, 100m の 2 件: 上限 3 - 0 = 3 なので全件追加可能
      expect(result!.length).toBe(2);
    });
  });

  // --- 境界値: 種目未選択 ---
  describe("種目未選択 (distance=null) の場合", () => {
    it("raceDistance が null のとき null を返す", () => {
      const result = computeAddSplitTimesEvery50m(null, [], true);
      expect(result).toBeNull();
    });

    it("raceDistance が 0 のとき null を返す (falsy guard)", () => {
      const result = computeAddSplitTimesEvery50m(0, [], true);
      expect(result).toBeNull();
    });
  });

  // --- 境界値: string 型 distance の型強制 (type coercion) ---
  describe("splitTime.distance が string 型でも正しく重複チェックされる", () => {
    it('"50" (string) が既存の場合も重複扱いになる', () => {
      // RecordFormScreen では parseFloat(String(st.distance)) || 0 でキャスト
      const existing = [{ distance: "50" as unknown as number, splitTime: 28.5 }];
      const result = computeAddSplitTimesEvery50m(100, existing, true);
      expect(result).not.toBeNull();
      // 50m は既存扱い (parseFloat("50") === 50) なので新たに追加されない
      // 結果: 既存 "50" + 新規 100 の 2 件
      expect(result!.length).toBe(2);
      // 新規追加は 100m のみ
      const newlyAdded = result!.filter((s) => typeof s.distance === "number" && s.distance === 100);
      expect(newlyAdded).toHaveLength(1);
    });
  });

  // --- 200m 種目: 50, 100, 150, 200 の 4 件 ---
  describe("200m 種目: 4 件追加される", () => {
    it("プレミアム: splitTimes 空 → [50, 100, 150, 200] 追加", () => {
      const result = computeAddSplitTimesEvery50m(200, [], true);
      expect(result).not.toBeNull();
      expect(result!.map((s) => s.distance)).toEqual([50, 100, 150, 200]);
    });
  });
});
