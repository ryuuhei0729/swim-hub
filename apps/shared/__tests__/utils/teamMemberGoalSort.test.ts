/**
 * sortTeamMemberGoals (Sprint Contract v1 S7)。
 * 今後 (今日を含む, 大会日昇順) → 過去 (大会日降順) → 大会 NULL。
 * 同日・同グループ内は created_at 昇順 → id 昇順。非破壊。
 * 「今日」は fake timers で 2026-10-04 に固定する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sortTeamMemberGoals } from "../../utils/teamMemberGoalSort";
import type { TeamMemberGoal } from "../../types/teamMemberGoals";

function goal(id: string, date: string | null, createdAt = "2026-01-01T00:00:00Z"): TeamMemberGoal {
  return {
    id,
    style_id: 1,
    target_time: 60,
    start_time: 70,
    status: "active",
    achieved_at: null,
    created_at: createdAt,
    competition_id: date ? `c-${id}` : null,
    competition_title: date ? `meet-${id}` : null,
    competition_date: date,
    competition_pool_type: date ? 1 : null,
    current_best_time: null,
    milestones: [],
  };
}
const ids = (gs: TeamMemberGoal[]) => gs.map((g) => g.id);

describe("sortTeamMemberGoals", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0)); // 2026-10-04 (ローカル)
  });
  afterEach(() => vi.useRealTimers());

  it("空配列は空配列", () => {
    expect(sortTeamMemberGoals([])).toEqual([]);
  });

  it("今後は昇順 → 過去は降順 → 大会NULL の順", () => {
    const input = [
      goal("null1", null),
      goal("past-old", "2026-01-10"),
      goal("fut-far", "2027-03-01"),
      goal("past-new", "2026-09-30"),
      goal("fut-near", "2026-11-01"),
    ];
    expect(ids(sortTeamMemberGoals(input))).toEqual([
      "fut-near", "fut-far", "past-new", "past-old", "null1",
    ]);
  });

  it("今日の大会は「今後」(過去グループの先頭ではなく今後グループの先頭)", () => {
    const input = [goal("yesterday", "2026-10-03"), goal("tomorrow", "2026-10-05"), goal("today", "2026-10-04")];
    expect(ids(sortTeamMemberGoals(input))).toEqual(["today", "tomorrow", "yesterday"]);
  });

  it("同日は created_at 昇順", () => {
    const input = [
      goal("a", "2026-12-01", "2026-03-02T00:00:00Z"),
      goal("b", "2026-12-01", "2026-03-01T00:00:00Z"),
    ];
    // id 昇順なら a,b だが created_at 昇順なら b,a (created_at が id より優先であること)
    expect(ids(sortTeamMemberGoals(input))).toEqual(["b", "a"]);
  });

  it("同日・同 created_at は id 昇順", () => {
    const input = [goal("z", "2026-12-01"), goal("m", "2026-12-01"), goal("a", "2026-12-01")];
    expect(ids(sortTeamMemberGoals(input))).toEqual(["a", "m", "z"]);
  });

  it("過去グループの同日も created_at 昇順 (日付だけ降順)", () => {
    const input = [
      goal("p2", "2026-05-01", "2026-02-02T00:00:00Z"),
      goal("p1", "2026-05-01", "2026-02-01T00:00:00Z"),
      goal("p0", "2026-06-01"),
    ];
    expect(ids(sortTeamMemberGoals(input))).toEqual(["p0", "p1", "p2"]);
  });

  it("大会NULL同士も created_at → id 昇順", () => {
    const input = [
      goal("n2", null, "2026-02-01T00:00:00Z"),
      goal("n1b", null, "2026-01-01T00:00:00Z"),
      goal("n1a", null, "2026-01-01T00:00:00Z"),
    ];
    expect(ids(sortTeamMemberGoals(input))).toEqual(["n1a", "n1b", "n2"]);
  });

  it("入力配列を破壊せず、新しい配列を返す", () => {
    const input = [goal("x", "2026-01-01"), goal("y", "2027-01-01")];
    const snapshot = ids(input);
    const out = sortTeamMemberGoals(input);
    expect(ids(input)).toEqual(snapshot);
    expect(out).not.toBe(input);
    expect(ids(out)).toEqual(["y", "x"]);
  });

  it("要素数は保存される (取りこぼし・重複なし)", () => {
    const input = [goal("a", null), goal("b", "2026-01-01"), goal("c", "2027-01-01"), goal("d", "2026-10-04")];
    expect(sortTeamMemberGoals(input)).toHaveLength(4);
    expect(new Set(ids(sortTeamMemberGoals(input)))).toEqual(new Set(["a", "b", "c", "d"]));
  });
});
