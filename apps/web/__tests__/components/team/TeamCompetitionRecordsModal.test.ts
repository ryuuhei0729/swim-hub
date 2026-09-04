import { describe, expect, it } from "vitest";
import { buildDisplaySplits } from "../../../components/team/TeamCompetitionRecordsModal";

// SplitTimeEntry のローカル型定義（テスト用）
interface SplitTimeEntry {
  id: string;
  distance: number;
  split_time: number;
}

// NOTE: `result[N]!` を使用する。このテストの入力 (3件の split + ゴール1件) から
// buildDisplaySplits が返す配列は常に4件になる (静的な入力に基づく決定的な結果)。
describe("buildDisplaySplits", () => {
  // ---- 正常系 ----

  describe("正常系: 通常の split_times あり、ゴールsplit なし", () => {
    it("ゴールsplit がない場合、recordTime をゴールタイムとして末尾に追加する", () => {
      const splits: SplitTimeEntry[] = [
        { id: "1", distance: 50, split_time: 28.5 },
        { id: "2", distance: 100, split_time: 58.0 },
      ];
      const result = buildDisplaySplits(splits, 200, 120.0);

      expect(result).toEqual([
        { distance: 50, splitTime: 28.5 },
        { distance: 100, splitTime: 58.0 },
        { distance: 200, splitTime: 120.0 }, // ゴール追加
      ]);
    });

    it("ゴールsplit が既に存在する場合、recordTime を追加しない", () => {
      const splits: SplitTimeEntry[] = [
        { id: "1", distance: 50, split_time: 28.5 },
        { id: "2", distance: 100, split_time: 58.0 },
      ];
      const result = buildDisplaySplits(splits, 100, 58.0);

      expect(result).toEqual([
        { distance: 50, splitTime: 28.5 },
        { distance: 100, splitTime: 58.0 },
      ]);
      expect(result).toHaveLength(2); // 追加されていない
    });

    it("split_times が distance 昇順にソートされる", () => {
      const splits: SplitTimeEntry[] = [
        { id: "2", distance: 100, split_time: 58.0 },
        { id: "1", distance: 50, split_time: 28.5 },
        { id: "3", distance: 150, split_time: 88.0 },
      ];
      const result = buildDisplaySplits(splits, 200, 120.0);

      expect(result[0]!.distance).toBe(50);
      expect(result[1]!.distance).toBe(100);
      expect(result[2]!.distance).toBe(150);
      expect(result[3]!.distance).toBe(200); // ゴール
    });
  });

  // ---- 境界値: 空配列 ----

  describe("境界値: split_times が空配列", () => {
    it("split_times が空配列のとき早期 return で空配列を返す", () => {
      const result = buildDisplaySplits([], 100, 58.0);
      expect(result).toEqual([]);
    });

    it("split_times が空配列のとき recordTime があっても空配列を返す", () => {
      const result = buildDisplaySplits([], 200, 120.0);
      expect(result).toHaveLength(0);
    });
  });

  // ---- 境界値: recordTime が 0 の場合、ゴールタイムを追加しない ----

  describe("境界値: recordTime が 0 の場合、ゴールタイムを追加しない", () => {
    it("recordTime が 0 のとき追加しない", () => {
      const splits: SplitTimeEntry[] = [
        { id: "1", distance: 50, split_time: 28.5 },
      ];
      const result = buildDisplaySplits(splits, 100, 0);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ distance: 50, splitTime: 28.5 });
    });
  });


  // ---- 正解実装 RecordSplitTimes.tsx との同等性検証 ----

  describe("正解実装 RecordSplitTimes.tsx との挙動一致検証", () => {
    it("全エントリが baseSplits に含まれ、ゴールsplit が追加される", () => {
      const splits: SplitTimeEntry[] = [
        { id: "1", distance: 50, split_time: 28.5 },
        { id: "2", distance: 100, split_time: 58.0 },
        { id: "3", distance: 150, split_time: 87.3 },
      ];
      const result = buildDisplaySplits(splits, 200, 118.0);

      // 3 件のエントリ + ゴール 1 件 = 4 件
      expect(result).toHaveLength(4);
      expect(result[3]).toEqual({ distance: 200, splitTime: 118.0 });
    });

    it("raceDistance が 0 でもゴールタイムを追加しない（正解実装と同一の raceDistance && recordTime && recordTime > 0 条件）", () => {
      const splits: SplitTimeEntry[] = [
        { id: "1", distance: 50, split_time: 28.5 },
      ];
      // raceDistance=0 は falsy → ゴール追加しない
      const result = buildDisplaySplits(splits, 0, 58.0);
      expect(result).toHaveLength(1);
    });

    it("baseSplits の最後の distance が raceDistance と一致する場合、ゴール追加しない", () => {
      // 200m のゴール split が既に含まれているケース
      const splits: SplitTimeEntry[] = [
        { id: "1", distance: 50, split_time: 28.5 },
        { id: "2", distance: 100, split_time: 58.0 },
        { id: "3", distance: 150, split_time: 87.3 },
        { id: "4", distance: 200, split_time: 118.0 },
      ];
      const result = buildDisplaySplits(splits, 200, 118.0);

      // ゴールが既にあるので追加なし = 4件
      expect(result).toHaveLength(4);
      // 200m が重複していないこと
      expect(result.filter((s) => s.distance === 200)).toHaveLength(1);
    });

    it("split_time=0 のエントリを含む場合、フィルタせずそのまま baseSplits に残す（フィルタは LapTimeDisplay の責務）", () => {
      // split_time=0 混在: buildDisplaySplits はフィルタしない
      const splits: SplitTimeEntry[] = [
        { id: "1", distance: 50, split_time: 0 },   // split_time=0 → 残る
        { id: "2", distance: 100, split_time: 56.0 },
      ];
      const result = buildDisplaySplits(splits, 200, 120.0);

      // baseSplits 2件 + ゴール 1件 = 3件
      expect(result).toHaveLength(3);
      // split_time=0 の要素が除去されていないこと
      expect(result.some((s) => s.distance === 50 && s.splitTime === 0)).toBe(true);
      // ゴールが追加されていること
      expect(result[2]).toEqual({ distance: 200, splitTime: 120.0 });
    });

    it("distance=0 のエントリを含む場合、フィルタせずそのまま baseSplits に残す（フィルタは LapTimeDisplay の責務）", () => {
      // distance=0 混在: buildDisplaySplits はフィルタしない
      const splits: SplitTimeEntry[] = [
        { id: "0", distance: 0, split_time: 5.0 },  // distance=0 → 残る
        { id: "1", distance: 50, split_time: 28.5 },
      ];
      const result = buildDisplaySplits(splits, 100, 58.0);

      // baseSplits 2件 + ゴール 1件 = 3件（distance=0 は除去されない）
      expect(result).toHaveLength(3);
      // distance=0 の要素が残っていること
      expect(result.some((s) => s.distance === 0)).toBe(true);
    });

    it("split_time=0 と distance=0 が混在する場合でも全エントリを残し、ゴールを追加する", () => {
      const splits: SplitTimeEntry[] = [
        { id: "0", distance: 0, split_time: 0 },
        { id: "1", distance: 50, split_time: 0 },
        { id: "2", distance: 100, split_time: 58.0 },
      ];
      const result = buildDisplaySplits(splits, 200, 120.0);

      // 3件の baseSplits + ゴール 1件 = 4件（フィルタなし）
      expect(result).toHaveLength(4);
      expect(result[3]).toEqual({ distance: 200, splitTime: 120.0 });
    });
  });

  // ---- 戻り値の構造 ----

  describe("戻り値の構造", () => {
    it("各要素は distance と splitTime を持つ", () => {
      const splits: SplitTimeEntry[] = [
        { id: "1", distance: 50, split_time: 28.5 },
      ];
      const result = buildDisplaySplits(splits, 100, 58.0);

      result.forEach((item) => {
        expect(item).toHaveProperty("distance");
        expect(item).toHaveProperty("splitTime");
        expect(typeof item.distance).toBe("number");
        expect(typeof item.splitTime).toBe("number");
      });
    });

    it("元の splitTimes 配列を変更しない（pure function）", () => {
      const splits: SplitTimeEntry[] = [
        { id: "2", distance: 100, split_time: 58.0 },
        { id: "1", distance: 50, split_time: 28.5 },
      ];
      const originalLength = splits.length;
      const originalOrder = splits.map((s) => s.distance);

      buildDisplaySplits(splits, 200, 120.0);

      expect(splits).toHaveLength(originalLength);
      expect(splits.map((s) => s.distance)).toEqual(originalOrder); // 元配列の順序は不変
    });
  });
});
