/**
 * isGoalTargetVisibleStatus / findGoalTargetTime (Sprint Contract goal_target_badge)
 * 8 箇所の画面が共通で通る述語。期待値はフィクスチャの正解から書く。
 */
import { describe, expect, it } from "vitest";
import {
  findGoalTargetTime,
  isGoalTargetVisibleStatus,
  type GoalTargetSource,
} from "../../utils/goalTarget";
import type { Goal } from "../../types/goals";
import type { TeamGoalTarget } from "../../types/goalTargets";

const ALL_STATUSES: Goal["status"][] = ["active", "achieved", "cancelled"];

describe("isGoalTargetVisibleStatus", () => {
  it("active / achieved は表示、cancelled は非表示", () => {
    expect(isGoalTargetVisibleStatus("active")).toBe(true);
    expect(isGoalTargetVisibleStatus("achieved")).toBe(true);
    expect(isGoalTargetVisibleStatus("cancelled")).toBe(false);
  });

  it("Goal['status'] の全値について真偽が定義されている (網羅。status が増えると下の件数で赤)", () => {
    const visible = ALL_STATUSES.filter(isGoalTargetVisibleStatus);
    expect(ALL_STATUSES).toHaveLength(3);
    expect(visible).toEqual(["active", "achieved"]);
  });
});

// 本人用 (competition_id あり)
const goal = (over: Partial<GoalTargetSource> = {}): GoalTargetSource => ({
  user_id: "u1",
  style_id: 2,
  target_time: 28.5,
  status: "active",
  competition_id: "c1",
  ...over,
});
// 代理用 (API 層が引数の大会 id を付与済み)
const team = (over: Partial<TeamGoalTarget> = {}): TeamGoalTarget => ({
  competition_id: "c1",
  user_id: "u1",
  style_id: 2,
  target_time: 28.5,
  status: "active",
  ...over,
});
const q = (over: Partial<Parameters<typeof findGoalTargetTime>[1]> = {}) => ({
  userId: "u1",
  competitionId: "c1",
  styleId: 2,
  ...over,
});

describe("findGoalTargetTime: 一致条件", () => {
  it("user / 大会 / 種目がすべて一致すると target_time を返す", () => {
    expect(findGoalTargetTime([goal()], q())).toBe(28.5);
  });
  it("別ユーザーでは null", () => {
    expect(findGoalTargetTime([goal()], q({ userId: "u2" }))).toBeNull();
  });
  it("別種目では null", () => {
    expect(findGoalTargetTime([goal()], q({ styleId: 3 }))).toBeNull();
  });
  it("別大会では null (本人用 Goal は大会を照合する)", () => {
    expect(findGoalTargetTime([goal()], q({ competitionId: "c2" }))).toBeNull();
  });
  it("空配列は null", () => {
    expect(findGoalTargetTime([], q())).toBeNull();
  });
  it("複数行から (user, 種目) が一致する行だけを選ぶ。他メンバーの同種目を取り違えない", () => {
    const rows = [
      team({ user_id: "u1", style_id: 2, target_time: 28 }),
      team({ user_id: "u2", style_id: 2, target_time: 29 }),
      team({ user_id: "u1", style_id: 3, target_time: 60 }),
    ];
    expect(findGoalTargetTime(rows, q({ userId: "u2" }))).toBe(29);
    expect(findGoalTargetTime(rows, q({ userId: "u1" }))).toBe(28);
    expect(findGoalTargetTime(rows, q({ userId: "u1", styleId: 3 }))).toBe(60);
  });
  it("target_time が 0 でも null にしない (0 は有効な値として返る)", () => {
    expect(findGoalTargetTime([goal({ target_time: 0 })], q())).toBe(0);
  });
});

describe("findGoalTargetTime: status", () => {
  it("achieved は返す", () => {
    expect(findGoalTargetTime([goal({ status: "achieved" })], q())).toBe(28.5);
  });
  it("cancelled は null", () => {
    expect(findGoalTargetTime([goal({ status: "cancelled" })], q())).toBeNull();
  });
  it("同一 (user, 種目) の cancelled と active が並ぶとき active を返す (先頭の cancelled に引きずられない)", () => {
    const rows = [goal({ status: "cancelled", target_time: 99 }), goal({ status: "active", target_time: 28.5 })];
    expect(findGoalTargetTime(rows, q())).toBe(28.5);
  });
});

describe("findGoalTargetTime: 引き継ぎ", () => {
  it("isRelaying === true なら一致していても null", () => {
    expect(findGoalTargetTime([goal()], q({ isRelaying: true }))).toBeNull();
    expect(findGoalTargetTime([team()], q({ isRelaying: true }))).toBeNull();
  });
  it("isRelaying === false なら返す (リレー第1泳者・個人記録)", () => {
    expect(findGoalTargetTime([goal()], q({ isRelaying: false }))).toBe(28.5);
  });
  it("isRelaying を渡さない (エントリー行) と返す", () => {
    expect(findGoalTargetTime([goal()], q())).toBe(28.5);
  });
});

describe("findGoalTargetTime: 大会 id", () => {
  it("competitionId が null (大会未保存) なら null", () => {
    expect(findGoalTargetTime([goal(), team()], q({ competitionId: null }))).toBeNull();
  });
  it("competitionId が undefined なら null", () => {
    expect(findGoalTargetTime([goal(), team()], q({ competitionId: undefined }))).toBeNull();
  });
  it("competitionId が空文字なら null", () => {
    expect(findGoalTargetTime([goal(), team()], q({ competitionId: "" }))).toBeNull();
  });
});

describe("findGoalTargetTime: 大会の照合 (本人用 Goal も TeamGoalTarget も常に照合する)", () => {
  it("TeamGoalTarget でも別の大会の id を持つ行は一致しない", () => {
    expect(findGoalTargetTime([team({ competition_id: "c2" })], q({ competitionId: "c1" }))).toBeNull();
  });
  it("TeamGoalTarget の大会 id が一致すれば返す", () => {
    expect(findGoalTargetTime([team()], q())).toBe(28.5);
  });
  it("別大会の同種目・同ユーザーの目標と並んでも、画面の大会の行を返す (他大会の目標が出ない)", () => {
    const rows = [team({ competition_id: "c2", target_time: 99 }), team({ competition_id: "c1", target_time: 28.5 })];
    expect(findGoalTargetTime(rows, q({ competitionId: "c1" }))).toBe(28.5);
    expect(findGoalTargetTime(rows, q({ competitionId: "c2" }))).toBe(99);
  });
  it("competition_id が null の本人の目標 (大会が削除された目標) はどの画面の大会 id とも一致しない", () => {
    const orphan = goal({ competition_id: null });
    for (const id of ["c1", "c2", "00000000-0000-0000-0000-000000000000"]) {
      expect(findGoalTargetTime([orphan], q({ competitionId: id }))).toBeNull();
    }
  });
  it("大会削除済み (null) の目標と、一致する大会の目標が並ぶとき後者を返す", () => {
    const rows = [goal({ competition_id: null, target_time: 99 }), goal({ competition_id: "c1", target_time: 28.5 })];
    expect(findGoalTargetTime(rows, q())).toBe(28.5);
  });
});
