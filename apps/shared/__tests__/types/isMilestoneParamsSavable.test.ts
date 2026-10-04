// =============================================================================
// isMilestoneParamsSavable (v4 M1)  — 0/空 params の保存拒否の判定関数
// =============================================================================
// 壊したら赤: いずれかの >0 / >=1 比較を緩める (>= 0 に) / type と params 形状の食い違いを許す。
// 各フィールドごとに「その1つだけが不正」な params で false になることを個別に検査する
// (まとめて不正にすると、1つの検査が欠けても通ってしまう)。
// =============================================================================
import { describe, expect, it } from "vitest";
import { isMilestoneParamsSavable } from "../../types/goals";
import type { MilestoneParams } from "../../types";

const time = { distance: 100, target_time: 60, style: "Fr", swim_category: "Swim" };
const reps = { distance: 50, reps: 6, sets: 3, target_average_time: 35, style: "Fr", swim_category: "Swim", circle: 90 };
const set = { distance: 200, reps: 4, sets: 3, circle: 140, style: "Fr", swim_category: "Swim" };
const ok = (t: "time" | "reps_time" | "set", p: Record<string, unknown>) => isMilestoneParamsSavable(t, p as unknown as MilestoneParams);

describe("正常系", () => {
  it("3 type の有効 params は true", () => {
    expect(ok("time", time)).toBe(true);
    expect(ok("reps_time", reps)).toBe(true);
    expect(ok("set", set)).toBe(true);
  });
  it("境界: reps=1 / sets=1 / 微小な正のタイム / circle=1 は true", () => {
    expect(ok("reps_time", { ...reps, reps: 1, sets: 1, circle: 1, target_average_time: 0.01 })).toBe(true);
    expect(ok("set", { ...set, reps: 1, sets: 1, circle: 1 })).toBe(true);
    expect(ok("time", { ...time, target_time: 0.01 })).toBe(true);
  });
});

describe("v5 L-c: reps_time の circle は判定に使われないため 0 でも保存可 (set は circle>0 必須のまま)", () => {
  it("reps_time: circle=0 でも他の条件が満たされていれば true", () => {
    expect(ok("reps_time", { ...reps, circle: 0 })).toBe(true);
  });
  it("reps_time: circle=0 でも reps=0 / sets=0 / target_average_time=0 / distance=0 はやはり false (circle 以外の条件は維持)", () => {
    expect(ok("reps_time", { ...reps, circle: 0, reps: 0 })).toBe(false);
    expect(ok("reps_time", { ...reps, circle: 0, sets: 0 })).toBe(false);
    expect(ok("reps_time", { ...reps, circle: 0, target_average_time: 0 })).toBe(false);
    expect(ok("reps_time", { ...reps, circle: 0, distance: 0 })).toBe(false);
  });
  it("set: circle=0 は false のまま (要約文に circle が出るため)", () => {
    expect(ok("set", { ...set, circle: 0 })).toBe(false);
  });
});

describe("1フィールドだけ不正 -> false", () => {
  it.each([
    ["time", "distance", time, 0], ["time", "distance", time, -1], ["time", "target_time", time, 0], ["time", "target_time", time, -5],
    ["reps_time", "distance", reps, 0], ["reps_time", "reps", reps, 0], ["reps_time", "sets", reps, 0],
    ["reps_time", "target_average_time", reps, 0],
    ["set", "distance", set, 0], ["set", "reps", set, 0], ["set", "sets", set, 0], ["set", "circle", set, 0],
  ] as const)("%s: %s=%s -> false", (type, field, base, value) => {
    expect(ok(type, { ...base, [field]: value })).toBe(false);
  });
  it("NaN は false", () => {
    expect(ok("time", { ...time, target_time: NaN })).toBe(false);
    expect(ok("set", { ...set, reps: NaN })).toBe(false);
  });
});

describe("type と params の形が食い違う -> false", () => {
  it("time 型に reps_time の params / reps_time 型に time の params / set 型に reps_time の params", () => {
    expect(ok("time", reps)).toBe(false);
    expect(ok("reps_time", time)).toBe(false);
    expect(ok("set", reps)).toBe(false);
    expect(ok("reps_time", set)).toBe(false);
  });
});
