/**
 * lapTimeCalculator (mobile) ユーティリティ テスト
 *
 * Sprint Contract: web+mobile+DB 横断 11 修正
 * 対象: #9 LapTimeDisplay の計算ユーティリティが web apps/web/utils/lapTimeCalculator.ts と同値であること。
 *
 * 検証方針 (Evaluator 独立性):
 *   - web の __tests__/utils/lapTimeCalculator.test.ts と「同じ期待値」で mobile util を検証する。
 *     実装をコピーした assertion (トートロジー) ではなく、水泳ドメインの既知の正解値で検証する。
 *   - mobile util は web から calculateLapTimesForInterval を除いた 3 関数を提供する
 *     (LapTimeDisplay が使うのは calculateAllLapTimes / calculateRaceLapTimesTable /
 *      getLapIntervalsForRace の 3 つのみ)。本テストはこの 3 関数を対象とする。
 *
 * 検証観点:
 * [LAP-01] calculateAllLapTimes — 正常系 (空 / 単一 / 連続 / 未ソート / IM)
 * [LAP-02] calculateAllLapTimes — 異常系 (split 0 / 0m 始点)
 * [LAP-03] getLapIntervalsForRace — 距離別 interval + 1500m 特殊 + 境界値
 * [LAP-04] calculateRaceLapTimesTable — 100m/200m テーブル + 25m 非倍数除外 + split 0 除外
 * [LAP-05] split 0 件 / raceDistance 不明相当 (interval=[]) のガード
 */
import { describe, expect, it } from "vitest";

import {
  calculateAllLapTimes,
  calculateRaceLapTimesTable,
  getLapIntervalsForRace,
  type SplitTime,
} from "@/utils/lapTimeCalculator";

describe("lapTimeCalculator (mobile, web 同値)", () => {
  describe("[LAP-01] calculateAllLapTimes 正常系", () => {
    it("空の配列は空の配列を返す", () => {
      expect(calculateAllLapTimes([])).toEqual([]);
    });

    it("1つのsplit-timeは0mからのlap-timeを返す", () => {
      const splitTimes: SplitTime[] = [{ distance: 50, splitTime: 30.5 }];
      expect(calculateAllLapTimes(splitTimes)).toEqual([
        { fromDistance: 0, toDistance: 50, lapTime: 30.5 },
      ]);
    });

    it("複数のsplit-timeから連続するlap-timeを計算する", () => {
      const splitTimes: SplitTime[] = [
        { distance: 50, splitTime: 30.0 },
        { distance: 100, splitTime: 62.0 },
      ];
      expect(calculateAllLapTimes(splitTimes)).toEqual([
        { fromDistance: 0, toDistance: 50, lapTime: 30.0 },
        { fromDistance: 50, toDistance: 100, lapTime: 32.0 },
      ]);
    });

    it("100m自由形の典型的なsplit-timeを計算する", () => {
      const splitTimes: SplitTime[] = [
        { distance: 25, splitTime: 12.5 },
        { distance: 50, splitTime: 26.0 },
        { distance: 75, splitTime: 40.0 },
        { distance: 100, splitTime: 55.0 },
      ];
      expect(calculateAllLapTimes(splitTimes)).toEqual([
        { fromDistance: 0, toDistance: 25, lapTime: 12.5 },
        { fromDistance: 25, toDistance: 50, lapTime: 13.5 },
        { fromDistance: 50, toDistance: 75, lapTime: 14.0 },
        { fromDistance: 75, toDistance: 100, lapTime: 15.0 },
      ]);
    });

    it("ソートされていないsplit-timeも正しく処理する", () => {
      const splitTimes: SplitTime[] = [
        { distance: 100, splitTime: 62.0 },
        { distance: 50, splitTime: 30.0 },
      ];
      expect(calculateAllLapTimes(splitTimes)).toEqual([
        { fromDistance: 0, toDistance: 50, lapTime: 30.0 },
        { fromDistance: 50, toDistance: 100, lapTime: 32.0 },
      ]);
    });

    it("200m個人メドレーの全ラップを計算する (リレー/IM)", () => {
      const splitTimes: SplitTime[] = [
        { distance: 50, splitTime: 28.0 },
        { distance: 100, splitTime: 62.0 },
        { distance: 150, splitTime: 100.0 },
        { distance: 200, splitTime: 130.0 },
      ];
      const result = calculateAllLapTimes(splitTimes);
      expect(result).toHaveLength(4);
      expect(result[1]).toEqual({ fromDistance: 50, toDistance: 100, lapTime: 34.0 });
      expect(result[3]).toEqual({ fromDistance: 150, toDistance: 200, lapTime: 30.0 });
    });
  });

  describe("[LAP-02] calculateAllLapTimes 異常系", () => {
    it("split-timeが0の場合はそのlap-timeを計算しない", () => {
      const splitTimes: SplitTime[] = [
        { distance: 50, splitTime: 30.0 },
        { distance: 100, splitTime: 0 },
        { distance: 150, splitTime: 95.0 },
      ];
      expect(calculateAllLapTimes(splitTimes)).toEqual([
        { fromDistance: 0, toDistance: 50, lapTime: 30.0 },
      ]);
    });

    it("0mから始まるsplit-timeがある場合は最初のlapを生成しない", () => {
      const splitTimes: SplitTime[] = [
        { distance: 0, splitTime: 0 },
        { distance: 50, splitTime: 30.0 },
      ];
      expect(calculateAllLapTimes(splitTimes)).toEqual([]);
    });
  });

  describe("[LAP-03] getLapIntervalsForRace", () => {
    it("25m種目は空の配列を返す", () => {
      expect(getLapIntervalsForRace(25)).toEqual([]);
    });
    it("50m種目は25mのみを返す", () => {
      expect(getLapIntervalsForRace(50)).toEqual([25]);
    });
    it("100m種目は25m, 50mを返す", () => {
      expect(getLapIntervalsForRace(100)).toEqual([25, 50]);
    });
    it("200m種目は25m, 50m, 100mを返す", () => {
      expect(getLapIntervalsForRace(200)).toEqual([25, 50, 100]);
    });
    it("400m種目は25m, 50m, 100m, 200mを返す", () => {
      expect(getLapIntervalsForRace(400)).toEqual([25, 50, 100, 200]);
    });
    it("800m種目は25m, 50m, 100m, 200m, 400mを返す", () => {
      expect(getLapIntervalsForRace(800)).toEqual([25, 50, 100, 200, 400]);
    });
    it("1500m種目は25m, 50m, 100mのみを返す（特殊ケース）", () => {
      expect(getLapIntervalsForRace(1500)).toEqual([25, 50, 100]);
    });
    it("24m（25m未満）は空の配列を返す（境界値）", () => {
      expect(getLapIntervalsForRace(24)).toEqual([]);
    });
    it("26m（25mより大きい）は25mを含む（境界値）", () => {
      expect(getLapIntervalsForRace(26)).toContain(25);
    });
  });

  describe("[LAP-04] calculateRaceLapTimesTable", () => {
    it("空の配列は空の配列を返す (split 0 件)", () => {
      expect(calculateRaceLapTimesTable([], 100)).toEqual([]);
    });

    it("100m自由形のテーブルを生成する", () => {
      const splitTimes: SplitTime[] = [
        { distance: 25, splitTime: 12.5 },
        { distance: 50, splitTime: 26.0 },
        { distance: 75, splitTime: 40.0 },
        { distance: 100, splitTime: 55.0 },
      ];
      const result = calculateRaceLapTimesTable(splitTimes, 100);
      expect(result).toHaveLength(4);
      expect(result[0]!.lapTimes[25]).toBe(12.5); // 直前の toHaveLength(4) で存在は保証済み
      expect(result[0]!.lapTimes[50]).toBeNull();
      expect(result[1]!.lapTimes[25]).toBe(13.5);
      expect(result[1]!.lapTimes[50]).toBe(26.0);
      expect(result[3]!.lapTimes[25]).toBe(15.0);
      expect(result[3]!.lapTimes[50]).toBe(29.0);
    });

    it("200m種目のテーブルを生成する", () => {
      const splitTimes: SplitTime[] = [
        { distance: 50, splitTime: 28.0 },
        { distance: 100, splitTime: 60.0 },
        { distance: 150, splitTime: 95.0 },
        { distance: 200, splitTime: 130.0 },
      ];
      const result = calculateRaceLapTimesTable(splitTimes, 200);
      expect(result).toHaveLength(4);
      expect(result[1]!.lapTimes[50]).toBe(32.0); // 直前の toHaveLength(4) で存在は保証済み
      expect(result[1]!.lapTimes[100]).toBe(60.0);
      expect(result[3]!.lapTimes[50]).toBe(35.0);
      expect(result[3]!.lapTimes[100]).toBe(70.0);
    });

    it("25mの倍数でない距離はフィルタリングされる", () => {
      const splitTimes: SplitTime[] = [
        { distance: 25, splitTime: 12.5 },
        { distance: 30, splitTime: 15.0 },
        { distance: 50, splitTime: 26.0 },
      ];
      const result = calculateRaceLapTimesTable(splitTimes, 100);
      expect(result).toHaveLength(2);
      expect(result[0]!.distance).toBe(25); // 直前の toHaveLength(2) で存在は保証済み
      expect(result[1]!.distance).toBe(50);
    });

    it("split-timeが0の距離はフィルタリングされる", () => {
      const splitTimes: SplitTime[] = [
        { distance: 25, splitTime: 12.5 },
        { distance: 50, splitTime: 0 },
        { distance: 75, splitTime: 40.0 },
      ];
      const result = calculateRaceLapTimesTable(splitTimes, 100);
      expect(result).toHaveLength(2);
      expect(result[0]!.distance).toBe(25); // 直前の toHaveLength(2) で存在は保証済み
      expect(result[1]!.distance).toBe(75);
    });
  });

  describe("[LAP-05] raceDistance 不明相当のガード", () => {
    it("getLapIntervalsForRace(0) は空配列 (raceDistance 未設定時に列が出ない)", () => {
      // LapTimeDisplay は raceDistance が falsy なら interval を [] にするが、
      // 0 が渡っても全ての >= 判定が false になり空配列となることを確認。
      expect(getLapIntervalsForRace(0)).toEqual([]);
    });
  });
});
