// isCompetitionDateInPast の境界 (v6: mobile 目標タブの過去判定で再利用)。Date を fake で固定し、ローカル暦日で比較する。
// 壊したら赤: < を <= に / null・空・不正日付を true に / UTC 変換で日付がずれる
import { afterEach, describe, expect, it, vi } from "vitest";
import { isCompetitionDateInPast, toISODateString } from "../../utils/date";

const setNow = (y: number, m: number, d: number, hh = 12, mm = 0) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(y, m - 1, d, hh, mm, 0));
};
afterEach(() => vi.useRealTimers());

describe("isCompetitionDateInPast", () => {
  it("今日=2026-10-04: 昨日 true / 今日 false / 明日 false", () => {
    setNow(2026, 10, 4);
    expect(isCompetitionDateInPast("2026-10-03")).toBe(true);
    expect(isCompetitionDateInPast("2026-10-04")).toBe(false);
    expect(isCompetitionDateInPast("2026-10-05")).toBe(false);
  });
  it.each([[0, 0], [0, 30], [23, 30], [23, 59]])("ローカル %s:%s でも境界が変わらない", (hh, mm) => {
    setNow(2026, 10, 4, hh, mm);
    expect(isCompetitionDateInPast("2026-10-03")).toBe(true);
    expect(isCompetitionDateInPast("2026-10-04")).toBe(false);
  });
  it("年末年始・閏日・月末", () => {
    setNow(2027, 1, 1, 0, 30);
    expect(isCompetitionDateInPast("2026-12-31")).toBe(true);
    expect(isCompetitionDateInPast("2027-01-01")).toBe(false);
    setNow(2028, 2, 29, 23, 30);
    expect(isCompetitionDateInPast("2028-02-28")).toBe(true);
    expect(isCompetitionDateInPast("2028-02-29")).toBe(false);
  });
  it("null / undefined / 空文字 / 不正日付は false (表示し続ける側に倒れる)", () => {
    setNow(2026, 10, 4);
    for (const v of [null, undefined, "", "not-a-date"]) expect(isCompetitionDateInPast(v), String(v)).toBe(false);
  });
});

describe("toISODateString (今日の yyyy-MM-dd)", () => {
  it.each([[0, 0], [0, 30], [23, 30], [23, 59]])("ローカル %s:%s の 2026-10-04 は '2026-10-04'", (hh, mm) => {
    expect(toISODateString(new Date(2026, 9, 4, hh, mm, 0))).toBe("2026-10-04");
  });
  it("年末年始・閏日", () => {
    expect(toISODateString(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
    expect(toISODateString(new Date(2027, 0, 1, 0, 0))).toBe("2027-01-01");
    expect(toISODateString(new Date(2028, 1, 29, 23, 30))).toBe("2028-02-29");
  });
});
