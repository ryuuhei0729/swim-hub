/**
 * selectUpcomingGoals / isCompetitionOver。
 * 本人の目標一覧から大会が終わった目標 (最終日 < 今日) を外し、大会日昇順 → 大会なしの順に並べる。
 */
import { describe, expect, it } from "vitest";
import { isCompetitionOver } from "../../utils/date";
import { selectUpcomingGoals } from "../../utils/upcomingGoals";

const TODAY = "2026-10-24";

function goal(
  id: string,
  date: string | null,
  endDate: string | null = null,
  createdAt = "2026-01-01T00:00:00Z",
) {
  return {
    id,
    created_at: createdAt,
    competition: date ? { date, end_date: endDate } : null,
  };
}
const ids = (gs: { id: string }[]) => gs.map((g) => g.id);

describe("isCompetitionOver", () => {
  it("単日開催: 昨日は終わり、今日・明日は終わっていない", () => {
    expect(isCompetitionOver("2026-10-23", null, TODAY)).toBe(true);
    expect(isCompetitionOver("2026-10-24", null, TODAY)).toBe(false);
    expect(isCompetitionOver("2026-10-25", null, TODAY)).toBe(false);
  });

  it("複数日開催は終了日で判定する (開催中は終わっていない)", () => {
    expect(isCompetitionOver("2026-10-22", "2026-10-24", TODAY)).toBe(false);
    expect(isCompetitionOver("2026-10-21", "2026-10-23", TODAY)).toBe(true);
  });

  it("日付が無い・無効なら false", () => {
    expect(isCompetitionOver(null, null, TODAY)).toBe(false);
    expect(isCompetitionOver(undefined, undefined, TODAY)).toBe(false);
    expect(isCompetitionOver("invalid", null, TODAY)).toBe(false);
  });
});

describe("selectUpcomingGoals", () => {
  it("大会が終わった目標を外し、開催中・今日・未来・大会なしを残す", () => {
    const input = [
      goal("past", "2026-10-23"),
      goal("ongoing", "2026-10-22", "2026-10-25"),
      goal("today", "2026-10-24"),
      goal("future", "2026-11-01"),
      goal("none", null),
    ];
    expect(ids(selectUpcomingGoals(input, TODAY))).toEqual(["ongoing", "today", "future", "none"]);
  });

  it("大会日昇順 → 大会なしは末尾。同日は created_at 昇順 → id 昇順", () => {
    const input = [
      goal("none", null),
      goal("far", "2027-03-01"),
      goal("b", "2026-12-01", null, "2026-03-01T00:00:00Z"),
      goal("a", "2026-12-01", null, "2026-03-02T00:00:00Z"),
      goal("z", "2026-11-01"),
      goal("m", "2026-11-01"),
    ];
    expect(ids(selectUpcomingGoals(input, TODAY))).toEqual(["m", "z", "b", "a", "far", "none"]);
  });

  it("入力を書き換えない", () => {
    const input = [goal("far", "2027-01-01"), goal("near", "2026-11-01")];
    selectUpcomingGoals(input, TODAY);
    expect(ids(input)).toEqual(["far", "near"]);
  });
});
