import { describe, it, expect } from "vitest";
import {
  MAX_COMPETITION_DAYS,
  competitionDaysFromRange,
  competitionEndDateFromDays,
} from "../../utils/competitionDays";

describe("competitionDaysFromRange", () => {
  it("終了日が無ければ1日", () => {
    expect(competitionDaysFromRange("2026-11-28", "")).toBe(1);
    expect(competitionDaysFromRange("2026-11-28", null)).toBe(1);
  });

  it("開始日と終了日から日数を出す (月またぎ・同日)", () => {
    expect(competitionDaysFromRange("2026-11-28", "2026-11-28")).toBe(1);
    expect(competitionDaysFromRange("2026-11-29", "2026-12-01")).toBe(3);
  });

  it("終了日が開始日より前・不正なら1日", () => {
    expect(competitionDaysFromRange("2026-11-28", "2026-11-27")).toBe(1);
    expect(competitionDaysFromRange("2026-11-28", "invalid")).toBe(1);
  });

  it("上限を超える既存データは実際の日数をそのまま返す", () => {
    expect(competitionDaysFromRange("2026-11-01", "2026-11-20")).toBe(20);
  });
});

describe("competitionEndDateFromDays", () => {
  it("1日なら終了日は空 (単日)", () => {
    expect(competitionEndDateFromDays("2026-11-28", 1)).toBe("");
  });

  it("日数から終了日を出す (月・年またぎ)", () => {
    expect(competitionEndDateFromDays("2026-11-28", 2)).toBe("2026-11-29");
    expect(competitionEndDateFromDays("2026-12-31", 3)).toBe("2027-01-02");
  });

  it("上限を超える日数は上限に収め、開始日が不正なら空", () => {
    expect(competitionEndDateFromDays("2026-11-01", 99)).toBe(
      `2026-11-${String(MAX_COMPETITION_DAYS).padStart(2, "0")}`,
    );
    expect(competitionEndDateFromDays("", 3)).toBe("");
  });
});
