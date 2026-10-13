// Sprint Contract (goal start time autofill) S3: pickGoalStartTime
// 定義: style_id 一致 / pool_type 一致 (===) / is_relaying=false / time > 0。GoalAPI.getBestTimeForStyle と同じ。
// fixture は「避けるべき行」(別種目・別水路・リレー・0以下) を必ず混ぜる。
// 壊したら赤: pool_type の falsy 判定 / is_relaying 除外の脱落 / relayingTime の採用 / time>0 ガードの脱落
import { describe, it, expect } from "vitest";
import type { BestTime } from "../../types/ui";
import { pickGoalStartTime } from "../../utils/goalStartTime";

const bt = (o: Partial<BestTime> & { id: string; style_id: number; pool_type: number; time: number }): BestTime => ({
  created_at: "",
  is_relaying: false,
  style: { name_jp: "x", distance: 100 },
  ...o,
});

const BESTS: readonly BestTime[] = [
  bt({ id: "s1-short", style_id: 1, pool_type: 0, time: 55 }),
  bt({ id: "s1-long", style_id: 1, pool_type: 1, time: 58, relayingTime: { id: "r", time: 50, created_at: "" } }),
  bt({ id: "s2-long", style_id: 2, pool_type: 1, time: 27 }),
  bt({ id: "s2-short-relay", style_id: 2, pool_type: 0, time: 20, is_relaying: true }),
];

describe("pickGoalStartTime: 一致条件", () => {
  it("種目と水路が両方一致する行のタイムを返す", () => {
    expect(pickGoalStartTime(BESTS, 1, 1)).toBe(58);
    expect(pickGoalStartTime(BESTS, 2, 1)).toBe(27);
  });

  it("短水路 (pool_type=0) を falsy として取りこぼさない", () => {
    expect(pickGoalStartTime(BESTS, 1, 0)).toBe(55);
  });

  it("水路が違う行は使わない (種目1 は短水路 55 / 長水路 58 を取り違えない)", () => {
    expect(pickGoalStartTime(BESTS, 1, 0)).not.toBe(58);
    expect(pickGoalStartTime(BESTS, 1, 1)).not.toBe(55);
  });

  it("種目が違う行は使わない (その種目の行が無ければ null)", () => {
    expect(pickGoalStartTime(BESTS, 3, 0)).toBeNull();
    expect(pickGoalStartTime(BESTS, 3, 1)).toBeNull();
  });

  it("種目は一致するが水路が一致する行が無ければ null", () => {
    expect(pickGoalStartTime([bt({ id: "x", style_id: 1, pool_type: 1, time: 58 })], 1, 0)).toBeNull();
    expect(pickGoalStartTime([bt({ id: "x", style_id: 1, pool_type: 0, time: 55 })], 1, 1)).toBeNull();
  });

  it("引き継ぎ付きのタイム (relayingTime) は採らず、通常の time を返す", () => {
    expect(pickGoalStartTime(BESTS, 1, 1)).toBe(58);
    expect(pickGoalStartTime(BESTS, 1, 1)).not.toBe(50);
  });
});

describe("pickGoalStartTime: リレー引き継ぎ", () => {
  it("リレー引き継ぎだけの記録 (種目2 短水路) は null", () => {
    expect(pickGoalStartTime(BESTS, 2, 0)).toBeNull();
  });

  it("非リレーとリレーの両方があれば非リレーを使う (並び順に依らない)", () => {
    const normal = bt({ id: "n", style_id: 5, pool_type: 1, time: 70 });
    const relay = bt({ id: "r", style_id: 5, pool_type: 1, time: 60, is_relaying: true });
    expect(pickGoalStartTime([normal, relay], 5, 1)).toBe(70);
    expect(pickGoalStartTime([relay, normal], 5, 1)).toBe(70);
  });
});

describe("pickGoalStartTime: time の境界値", () => {
  const one = (time: number) => [bt({ id: "t", style_id: 1, pool_type: 0, time })];

  it("time が 0 は null", () => {
    expect(pickGoalStartTime(one(0), 1, 0)).toBeNull();
  });

  it("time が負数は null", () => {
    expect(pickGoalStartTime(one(-1), 1, 0)).toBeNull();
    expect(pickGoalStartTime(one(-0.01), 1, 0)).toBeNull();
  });

  it("time が 0.01 (正の最小) は採る", () => {
    expect(pickGoalStartTime(one(0.01), 1, 0)).toBe(0.01);
  });

  it("time が 0 の非リレー行と有効なリレー行しか無ければ null (リレーで埋めない)", () => {
    const rows = [
      bt({ id: "zero", style_id: 1, pool_type: 0, time: 0 }),
      bt({ id: "relay", style_id: 1, pool_type: 0, time: 50, is_relaying: true }),
    ];
    expect(pickGoalStartTime(rows, 1, 0)).toBeNull();
  });
});

describe("pickGoalStartTime: 空・不変", () => {
  it("空配列は null", () => {
    expect(pickGoalStartTime([], 1, 0)).toBeNull();
    expect(pickGoalStartTime([], 1, 1)).toBeNull();
  });

  it("readonly (freeze 済み) の入力を破壊しない", () => {
    const frozen = Object.freeze(BESTS.map((b) => Object.freeze({ ...b })));
    expect(() => pickGoalStartTime(frozen, 1, 0)).not.toThrow();
    expect(frozen).toHaveLength(BESTS.length);
  });
});
