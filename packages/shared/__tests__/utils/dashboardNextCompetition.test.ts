import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildNextCompetitionRows,
  daysUntilCompetition,
  entryStatusOn,
  formatNextCompetitionEvent,
  pickNextCompetition,
  resolveNextCompetitionState,
  type NextCompetitionCandidate,
} from "../../utils/dashboardNextCompetition";
import type { BestTime } from "../../types/ui";

const TODAY = "2026-11-07";

function comp(overrides: Partial<NextCompetitionCandidate> & { id: string; date: string }) {
  return {
    title: overrides.id,
    end_date: null,
    place: null,
    pool_type: 1,
    team_id: null,
    entry_status: null,
    ...overrides,
  } satisfies NextCompetitionCandidate;
}

function best(overrides: Partial<BestTime> & { style_id: number; time: number }): BestTime {
  return {
    id: `b-${overrides.style_id}-${overrides.time}`,
    created_at: "2026-10-01T00:00:00Z",
    pool_type: 1,
    is_relaying: false,
    style: { name_jp: "", distance: 0 },
    ...overrides,
  };
}

describe("pickNextCompetition", () => {
  it("開始日が最も早い、今日以降の大会を選ぶ", () => {
    const picked = pickNextCompetition(
      [comp({ id: "late", date: "2026-12-06" }), comp({ id: "soon", date: "2026-11-19" })],
      new Set(),
      TODAY,
    );
    expect(picked?.id).toBe("soon");
  });

  it("今日開催の大会は対象にし、昨日の大会は対象にしない", () => {
    expect(
      pickNextCompetition([comp({ id: "today", date: TODAY })], new Set(), TODAY)?.id,
    ).toBe("today");
    expect(pickNextCompetition([comp({ id: "y", date: "2026-11-06" })], new Set(), TODAY)).toBe(
      null,
    );
  });

  it("開始日が過ぎても最終日が今日以降の複数日大会は対象にする", () => {
    const picked = pickNextCompetition(
      [comp({ id: "multi", date: "2026-11-06", end_date: "2026-11-08" })],
      new Set(),
      TODAY,
    );
    expect(picked?.id).toBe("multi");
  });

  it("チーム大会でエントリー締切済みかつ自分のエントリーが無いものは飛ばす", () => {
    const picked = pickNextCompetition(
      [
        comp({ id: "closed", date: "2026-11-10", team_id: "t1", entry_status: "closed" }),
        comp({ id: "next", date: "2026-11-20", team_id: "t1", entry_status: "open" }),
      ],
      new Set(),
      TODAY,
    );
    expect(picked?.id).toBe("next");
  });

  it("チーム大会で締切済みでも自分のエントリーがあれば選ぶ", () => {
    const picked = pickNextCompetition(
      [comp({ id: "closed", date: "2026-11-10", team_id: "t1", entry_status: "closed" })],
      new Set(["closed"]),
      TODAY,
    );
    expect(picked?.id).toBe("closed");
  });

  it("チーム大会で受付前・受付中ならエントリーが無くても選ぶ", () => {
    for (const status of ["before", "open", null] as const) {
      const picked = pickNextCompetition(
        [comp({ id: "c", date: "2026-11-10", team_id: "t1", entry_status: status })],
        new Set(),
        TODAY,
      );
      expect(picked?.id).toBe("c");
    }
  });

  it("自分で登録した大会は締切状態に関係なく選ぶ", () => {
    const picked = pickNextCompetition(
      [comp({ id: "mine", date: "2026-11-10", entry_status: "closed" })],
      new Set(),
      TODAY,
    );
    expect(picked?.id).toBe("mine");
  });

  it("大会が無ければ null", () => {
    expect(pickNextCompetition([], new Set(), TODAY)).toBe(null);
  });

  describe("締切の判定は端末の今日ではなく引数の today で行う", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("端末の時計が大会日を過ぎていても、today より後の受付中の大会は選ぶ", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2027-01-01T12:00:00"));
      const picked = pickNextCompetition(
        [comp({ id: "open", date: "2026-11-10", team_id: "t1", entry_status: "open" })],
        new Set(),
        TODAY,
      );
      expect(picked?.id).toBe("open");
    });
  });
});

describe("entryStatusOn", () => {
  it("大会日が today より前なら closed、当日以降は DB の値 (未設定は before)", () => {
    expect(entryStatusOn("2026-11-06", "open", TODAY)).toBe("closed");
    expect(entryStatusOn(TODAY, "open", TODAY)).toBe("open");
    expect(entryStatusOn("2026-11-10", null, TODAY)).toBe("before");
  });
});

describe("buildNextCompetitionRows", () => {
  const entries = [
    { id: "e1", style_id: 2, entry_time: 56.2, is_relaying: false, style: { id: 2, name_jp: "100m自由形", distance: 100, style: "Fr" as const } },
    { id: "e2", style_id: 7, entry_time: 25.9, is_relaying: false, style: { id: 7, name_jp: "50m自由形", distance: 50, style: "Fr" as const } },
  ];

  it("同じ水路・リレー以外のベストを使い、目標との差を出す", () => {
    const rows = buildNextCompetitionRows(
      entries,
      [{ id: "g1", style_id: 2, target_time: 55.5 }],
      [
        best({ style_id: 2, time: 55.0, pool_type: 0 }), // 短水路: 対象外
        best({ style_id: 2, time: 54.0, pool_type: 1, is_relaying: true }), // リレー: 対象外
        best({ style_id: 2, time: 56.12, pool_type: 1 }),
      ],
      1,
    );
    expect(rows[0]).toMatchObject({
      entryId: "e1",
      bestTime: 56.12,
      goalId: "g1",
      targetTime: 55.5,
      gapToTarget: -0.62,
    });
  });

  it("目標もベストも無い種目は null を返す", () => {
    const rows = buildNextCompetitionRows(entries, [], [], 1);
    expect(rows[1]).toMatchObject({
      entryId: "e2",
      bestTime: null,
      goalId: null,
      targetTime: null,
      gapToTarget: null,
    });
  });

  it("リレーのエントリーには個人のベストも目標も付けない", () => {
    const rows = buildNextCompetitionRows(
      [{ ...entries[0]!, id: "relay", is_relaying: true }],
      [{ id: "g1", style_id: 2, target_time: 55.5 }],
      [best({ style_id: 2, time: 56.12 })],
      1,
    );
    expect(rows[0]).toMatchObject({
      entryId: "relay",
      isRelaying: true,
      bestTime: null,
      goalId: null,
      targetTime: null,
      gapToTarget: null,
    });
  });

  it("ベストが目標より速ければ差は正になる", () => {
    const rows = buildNextCompetitionRows(
      entries.slice(0, 1),
      [{ id: "g1", style_id: 2, target_time: 57 }],
      [best({ style_id: 2, time: 56.12 })],
      1,
    );
    expect(rows[0]!.gapToTarget).toBe(0.88);
  });
});

describe("daysUntilCompetition", () => {
  it("当日は 0、12日後は 12、開催中 (開始日が過去) は 0", () => {
    expect(daysUntilCompetition(TODAY, TODAY)).toBe(0);
    expect(daysUntilCompetition("2026-11-19", TODAY)).toBe(12);
    expect(daysUntilCompetition("2026-11-06", TODAY)).toBe(0);
  });
});

describe("resolveNextCompetitionState", () => {
  it("大会なし / エントリーなし / エントリーあり を返す", () => {
    expect(resolveNextCompetitionState(null, 0)).toBe("none");
    expect(resolveNextCompetitionState(comp({ id: "c", date: TODAY }), 0)).toBe("noEntries");
    expect(resolveNextCompetitionState(comp({ id: "c", date: TODAY }), 2)).toBe("entries");
  });
});

describe("formatNextCompetitionEvent", () => {
  it("公式略称の書き方 (距離m 空白 種目コード) にする", () => {
    expect(formatNextCompetitionEvent({ id: 3, name_jp: "100m自由形", distance: 100, style: "Fr" })).toBe(
      "100m Fr",
    );
    expect(formatNextCompetitionEvent({ id: 21, name_jp: "200m個人メドレー", distance: 200, style: "IM" })).toBe(
      "200m IM",
    );
  });

  it("種目コードが無ければ name_jp、種目も無ければ「-」", () => {
    expect(formatNextCompetitionEvent({ id: 3, name_jp: "100m自由形", distance: 100, style: null })).toBe(
      "100m自由形",
    );
    expect(formatNextCompetitionEvent(null)).toBe("-");
  });
});
