import { describe, expect, it } from "vitest";
import {
  buildLastPracticeRows,
  formatLastPracticeMenu,
  pickInitialDashboardCard,
  type LastPracticeLog,
} from "../../utils/dashboardLastPractice";

function only<T>(rows: T[]): T {
  expect(rows).toHaveLength(1);
  return rows[0] as T;
}

function log(overrides: Partial<LastPracticeLog> & { id: string }): LastPracticeLog {
  return {
    style: "Fr",
    swim_category: "Swim",
    distance: 100,
    rep_count: 5,
    set_count: 1,
    circle: 90,
    created_at: "2026-11-24T07:00:00Z",
    practice_times: [],
    ...overrides,
  };
}

describe("buildLastPracticeRows", () => {
  it("メニューを登録した順に並べる", () => {
    const rows = buildLastPracticeRows([
      log({ id: "b", created_at: "2026-11-24T07:10:00Z" }),
      log({ id: "a", created_at: "2026-11-24T07:00:00Z" }),
    ]);
    expect(rows.map((r) => r.logId)).toEqual(["a", "b"]);
  });

  it("タイムをセット→本の順に並べ、最速と平均を出す", () => {
    const row = only(
      buildLastPracticeRows([
        log({
          id: "a",
          rep_count: 2,
          set_count: 2,
          practice_times: [
            { set_number: 2, rep_number: 1, time: 64 },
            { set_number: 1, rep_number: 2, time: 65 },
            { set_number: 1, rep_number: 1, time: 66 },
            { set_number: 2, rep_number: 2, time: 63 },
          ],
        }),
      ]),
    );
    expect(row.times).toEqual([66, 65, 64, 63]);
    expect(row.fastest).toBe(63);
    expect(row.average).toBe(64.5);
  });

  it("0 以下のタイムは未入力として除く", () => {
    const row = only(
      buildLastPracticeRows([
        log({
          id: "a",
          practice_times: [
            { set_number: 1, rep_number: 1, time: 0 },
            { set_number: 1, rep_number: 2, time: 30 },
          ],
        }),
      ]),
    );
    expect(row.times).toEqual([30]);
    expect(row.average).toBe(30);
  });

  it("タイムが無いメニューは最速・平均が null", () => {
    const row = only(buildLastPracticeRows([log({ id: "a", practice_times: null })]));
    expect(row.times).toEqual([]);
    expect(row.fastest).toBeNull();
    expect(row.average).toBeNull();
  });
});

describe("formatLastPracticeMenu", () => {
  it("1セットなら距離×本数", () => {
    expect(formatLastPracticeMenu({ distance: 100, repCount: 5, setCount: 1 })).toBe("100×5");
  });

  it("2セット以上ならセット数も付ける", () => {
    expect(formatLastPracticeMenu({ distance: 50, repCount: 4, setCount: 2 })).toBe("50×4×2");
  });
});

describe("pickInitialDashboardCard", () => {
  const tomorrow = "2026-11-27";

  it("大会が明日なら、練習の予定があっても次の大会", () => {
    expect(
      pickInitialDashboardCard({
        nextCompetitionDate: "2026-11-27",
        hasPracticeSoon: true,
        tomorrow,
      }),
    ).toBe("nextCompetition");
  });

  it("開催中の大会 (開始日が昨日以前) も次の大会", () => {
    expect(
      pickInitialDashboardCard({
        nextCompetitionDate: "2026-11-25",
        hasPracticeSoon: true,
        tomorrow,
      }),
    ).toBe("nextCompetition");
  });

  it("大会が明後日以降で、今日・明日に練習があれば前回の練習", () => {
    expect(
      pickInitialDashboardCard({
        nextCompetitionDate: "2026-11-28",
        hasPracticeSoon: true,
        tomorrow,
      }),
    ).toBe("lastPractice");
  });

  it("大会が無くても、今日・明日に練習があれば前回の練習", () => {
    expect(
      pickInitialDashboardCard({ nextCompetitionDate: null, hasPracticeSoon: true, tomorrow }),
    ).toBe("lastPractice");
  });

  it("練習の予定が無ければ次の大会", () => {
    expect(
      pickInitialDashboardCard({
        nextCompetitionDate: "2026-12-13",
        hasPracticeSoon: false,
        tomorrow,
      }),
    ).toBe("nextCompetition");
    expect(
      pickInitialDashboardCard({ nextCompetitionDate: null, hasPracticeSoon: false, tomorrow }),
    ).toBe("nextCompetition");
  });
});
