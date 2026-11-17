import { describe, it, expect } from "vitest";
import {
  EMPTY_PRACTICE_FIELDS,
  buildBulkRegisterInput,
  buildExistingScheduleMap,
  competitionEndDate,
  countByMonth,
  datesOfWeekdayInMonth,
  findDraftCovering,
  rangeOverlapsCompetition,
  toCircledNumber,
  toggleDate,
  toggleWeekdayInMonth,
  weekdayLabels,
  type CompetitionDraft,
} from "../bulkRegisterUtils";

const NOV_2026 = new Date(2026, 10, 1);

const draft = (over: Partial<CompetitionDraft>): CompetitionDraft => ({
  id: "d1",
  date: "2026-11-28",
  days: 1,
  title: "",
  place: "",
  poolType: 0,
  note: "",
  noteOpen: false,
  ...over,
});

describe("toCircledNumber", () => {
  it("1〜50 を丸数字にし、51 以上は (n) にする", () => {
    expect(toCircledNumber(1)).toBe("①");
    expect(toCircledNumber(6)).toBe("⑥");
    expect(toCircledNumber(20)).toBe("⑳");
    expect(toCircledNumber(21)).toBe("㉑");
    expect(toCircledNumber(35)).toBe("㉟");
    expect(toCircledNumber(36)).toBe("㊱");
    expect(toCircledNumber(50)).toBe("㊿");
    expect(toCircledNumber(51)).toBe("(51)");
  });
});

describe("曜日でまとめて選ぶ", () => {
  it("2026年11月の火曜日は 3, 10, 17, 24 日", () => {
    expect(datesOfWeekdayInMonth(NOV_2026, 2)).toEqual([
      "2026-11-03",
      "2026-11-10",
      "2026-11-17",
      "2026-11-24",
    ]);
  });

  it("一部だけ選ばれていれば全部選び、全部選ばれていれば全部外す (他の日はそのまま)", () => {
    const once = toggleWeekdayInMonth(["2026-11-10", "2026-11-05"], NOV_2026, 2);
    expect(once).toEqual(["2026-11-03", "2026-11-05", "2026-11-10", "2026-11-17", "2026-11-24"]);
    expect(toggleWeekdayInMonth(once, NOV_2026, 2)).toEqual(["2026-11-05"]);
  });

  it("日付1件の切り替えは日付順を保つ", () => {
    expect(toggleDate(["2026-11-24"], "2026-11-03")).toEqual(["2026-11-03", "2026-11-24"]);
    expect(toggleDate(["2026-11-03", "2026-11-24"], "2026-11-03")).toEqual(["2026-11-24"]);
  });

  it("曜日見出しは日曜始まり", () => {
    expect(weekdayLabels("ja")).toEqual(["日", "月", "火", "水", "木", "金", "土"]);
  });
});

describe("countByMonth", () => {
  it("月ごとの件数を月順に返す", () => {
    expect(countByMonth(["2026-12-01", "2026-11-24", "2026-11-03"])).toEqual([
      { month: "2026-11", count: 2 },
      { month: "2026-12", count: 1 },
    ]);
  });
});

describe("大会の期間", () => {
  it("日数から最終日を出す (月をまたぐ場合も)", () => {
    expect(competitionEndDate("2026-11-28", 1)).toBe("2026-11-28");
    expect(competitionEndDate("2026-11-29", 3)).toBe("2026-12-01");
  });

  it("findDraftCovering は期間内の日付で見つかる", () => {
    const d = draft({ date: "2026-11-28", days: 2 });
    expect(findDraftCovering([d], "2026-11-29")).toBe(d);
    expect(findDraftCovering([d], "2026-11-30")).toBeUndefined();
  });

  it("登録済みの大会・他の追加予定と期間が重なるかを判定する (自分自身は除く)", () => {
    const existing = buildExistingScheduleMap([], [{ date: "2026-12-05", end_date: "2026-12-06" }]);
    const other = draft({ id: "other", date: "2026-11-28", days: 2 });
    expect(rangeOverlapsCompetition("2026-12-04", 2, existing, [], null)).toBe(true);
    expect(rangeOverlapsCompetition("2026-12-02", 2, existing, [], null)).toBe(false);
    expect(rangeOverlapsCompetition("2026-11-27", 2, existing, [other], null)).toBe(true);
    expect(rangeOverlapsCompetition("2026-11-28", 2, existing, [other], "other")).toBe(false);
  });
});

describe("buildExistingScheduleMap", () => {
  it("練習は日付、大会は開催期間の全日に印を付ける", () => {
    const map = buildExistingScheduleMap(
      [{ date: "2026-11-18" }],
      [{ date: "2026-11-30", end_date: "2026-12-01" }, { date: "2026-11-18", end_date: null }],
    );
    expect(map["2026-11-18"]).toEqual({ practice: true, competition: true });
    expect(map["2026-11-30"]).toEqual({ practice: false, competition: true });
    expect(map["2026-12-01"]).toEqual({ practice: false, competition: true });
  });
});

describe("buildBulkRegisterInput", () => {
  it("練習は日ごとの上書き → 共通の内容の順で決まり、空は null になる", () => {
    const input = buildBulkRegisterInput(
      ["2026-11-25", "2026-11-24"],
      { title: "通常練習", place: "市民プール", note: "", noteOpen: false },
      { "2026-11-25": { ...EMPTY_PRACTICE_FIELDS, title: "記録会", note: "8時集合" } },
      [],
    );
    expect(input.practices).toEqual([
      { date: "2026-11-24", title: "通常練習", place: "市民プール", note: null },
      { date: "2026-11-25", title: "記録会", place: "市民プール", note: "8時集合" },
    ]);
    expect(input.competitions).toEqual([]);
  });

  it("大会は2日以上なら end_date を付ける", () => {
    const input = buildBulkRegisterInput([], EMPTY_PRACTICE_FIELDS, {}, [
      draft({ id: "b", date: "2026-12-05", days: 2, title: "関東ジュニア", poolType: 1 }),
      draft({ id: "a", date: "2026-11-28", days: 1, place: " 辰巳 " }),
    ]);
    expect(input.competitions).toEqual([
      { date: "2026-11-28", end_date: null, title: null, place: "辰巳", pool_type: 0, note: null },
      { date: "2026-12-05", end_date: "2026-12-06", title: "関東ジュニア", place: null, pool_type: 1, note: null },
    ]);
  });
});
