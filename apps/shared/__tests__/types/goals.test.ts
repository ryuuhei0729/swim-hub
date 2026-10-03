/**
 * apps/shared/types/goals.ts の isMilestoneTimeValueValid 単体テスト
 *
 * マイルストーンの目標タイム欄 (type: "time" の target_time /
 * type: "reps_time" の target_average_time) が保存可能な値かどうかを判定する
 * 純粋関数。0秒・負数はタイムとして意味を持たず達成判定も成立しないため無効、
 * タイムを持たない set 型は常に有効。
 *
 * トートロジー防止メモ: 期待値は「0秒・負数の目標タイムは保存できない」という
 * 仕様から導出したものであり、実装の `> 0` 比較をそのまま転記したものではない
 * (0 と負数の両方を境界値として個別に確認する)。
 */
import { describe, expect, it } from "vitest";
import { isMilestoneTimeValueValid } from "../../types/goals";
import type {
  MilestoneTimeParams,
  MilestoneRepsTimeParams,
  MilestoneSetParams,
  MilestoneGoalSetParams,
} from "../../types/goals";

const baseTimeParams: MilestoneTimeParams = {
  distance: 100,
  target_time: 60,
  style: "Fr",
  swim_category: "Swim",
};

const baseRepsTimeParams: MilestoneRepsTimeParams = {
  distance: 100,
  reps: 4,
  sets: 1,
  target_average_time: 90,
  style: "Fr",
  swim_category: "Swim",
  circle: 90,
};

const baseSetParams: MilestoneSetParams = {
  distance: 100,
  reps: 4,
  sets: 1,
  circle: 90,
  style: "Fr",
  swim_category: "Swim",
};

const baseGoalSetParams: MilestoneGoalSetParams = {
  ...baseRepsTimeParams,
  practice_pool_type: 0,
};

describe("isMilestoneTimeValueValid", () => {
  describe("type: time (target_time)", () => {
    it("target_time が正数なら true", () => {
      expect(isMilestoneTimeValueValid({ ...baseTimeParams, target_time: 60 })).toBe(true);
    });

    it("target_time が 0 なら false", () => {
      expect(isMilestoneTimeValueValid({ ...baseTimeParams, target_time: 0 })).toBe(false);
    });

    it("target_time が負数なら false", () => {
      expect(isMilestoneTimeValueValid({ ...baseTimeParams, target_time: -5 })).toBe(false);
    });
  });

  describe("type: reps_time (target_average_time)", () => {
    it("target_average_time が正数なら true", () => {
      expect(
        isMilestoneTimeValueValid({ ...baseRepsTimeParams, target_average_time: 45.5 }),
      ).toBe(true);
    });

    it("target_average_time が 0 なら false", () => {
      expect(isMilestoneTimeValueValid({ ...baseRepsTimeParams, target_average_time: 0 })).toBe(
        false,
      );
    });

    it("target_average_time が負数なら false", () => {
      expect(isMilestoneTimeValueValid({ ...baseRepsTimeParams, target_average_time: -1 })).toBe(
        false,
      );
    });

    it("[非退行] ゴールセット (reps_time を拡張した型) も target_average_time で同様に判定される", () => {
      expect(
        isMilestoneTimeValueValid({ ...baseGoalSetParams, target_average_time: 0 }),
      ).toBe(false);
      expect(
        isMilestoneTimeValueValid({ ...baseGoalSetParams, target_average_time: 30 }),
      ).toBe(true);
    });
  });

  describe("type: set (タイムを持たない)", () => {
    it("set 型は target_time/target_average_time 自体が存在しないため常に true", () => {
      expect(isMilestoneTimeValueValid(baseSetParams)).toBe(true);
    });
  });
});
