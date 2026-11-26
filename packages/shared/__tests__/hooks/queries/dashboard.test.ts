// @vitest-environment jsdom
/**
 * useNextCompetitionQuery / useUnrecordedCompetitionsQuery / useLastPracticeQuery /
 * usePracticeSoonQuery のテスト。
 *
 * 共有モック (createMockQueryBuilder) はフィルタを適用せず固定データを返すため、
 * 「他人のエントリーを数えない」「過去の大会を除く」といった絞り込みを検証できない。
 * ここでは eq / neq / gte / lt / in / or を実際にデータへ適用する軽量モックを使い、
 * 返り値で検証する。日付は new Date() からの相対で作る。
 */

import { describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { addDays, format, subDays } from "date-fns";
import {
  useDashboardInitialCard,
  useLastPracticeQuery,
  useNextCompetitionQuery,
  usePracticeSoonQuery,
  useUnrecordedCompetitionsQuery,
} from "../../../hooks/queries/dashboard";
import { renderQueryHook } from "../../utils/test-utils";

const NOW = new Date();
const day = (offset: number) =>
  format(offset >= 0 ? addDays(NOW, offset) : subDays(NOW, -offset), "yyyy-MM-dd");

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function createFilterableSupabase(
  tables: Tables,
  selects: Record<string, string[]> = {},
  /** テーブルごとに返すエラー。指定したテーブルは data: null と一緒にこのエラーを返す */
  errors: Record<string, Error> = {},
) {
  const from = vi.fn((table: string) => {
    let rows: Row[] = [...(tables[table] ?? [])];
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn((columns: string) => {
      (selects[table] ??= []).push(columns);
      return builder;
    });
    builder.eq = vi.fn((col: string, val: unknown) => {
      // "practice_logs.user_id" のような埋め込み先の列は、!inner の埋め込みとして
      // 子の行を絞り、子が残らなかった親を落とす
      const [rel, child] = col.split(".");
      if (child) {
        rows = rows
          .map((r) => ({ ...r, [rel!]: (r[rel!] as Row[]).filter((c) => c[child] === val) }))
          .filter((r) => (r[rel!] as Row[]).length > 0);
        return builder;
      }
      rows = rows.filter((r) => r[col] === val);
      return builder;
    });
    builder.neq = vi.fn((col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] !== val);
      return builder;
    });
    builder.gte = vi.fn((col: string, val: string) => {
      rows = rows.filter((r) => (r[col] as string) >= val);
      return builder;
    });
    builder.lte = vi.fn((col: string, val: string) => {
      rows = rows.filter((r) => (r[col] as string) <= val);
      return builder;
    });
    builder.lt = vi.fn((col: string, val: string) => {
      rows = rows.filter((r) => (r[col] as string) < val);
      return builder;
    });
    builder.in = vi.fn((col: string, vals: unknown[]) => {
      rows = rows.filter((r) => vals.includes(r[col]));
      return builder;
    });
    // "col.gte.X" / "col.eq.X" / "col.not.is.null" を "," でつないだ形だけを解釈する
    builder.or = vi.fn((expr: string) => {
      const conds = expr.split(",").map((c) => {
        const [col, ...rest] = c.split(".");
        const op = rest.join(".");
        if (op === "not.is.null") return (r: Row) => r[col!] != null;
        if (op.startsWith("eq.")) return (r: Row) => r[col!] === op.slice(3);
        if (op.startsWith("gte."))
          return (r: Row) => r[col!] != null && (r[col!] as string) >= op.slice(4);
        throw new Error(`unsupported op ${op}`);
      });
      rows = rows.filter((r) => conds.some((cond) => cond(r)));
      return builder;
    });
    // order を重ねると、先に指定した列から順に比べる (PostgREST と同じ)
    const orders: Array<{ col: string; asc: boolean }> = [];
    builder.order = vi.fn((col: string, opts?: { ascending?: boolean }) => {
      orders.push({ col, asc: opts?.ascending !== false });
      rows = [...rows].sort((a, b) => {
        for (const o of orders) {
          const c = String(a[o.col]).localeCompare(String(b[o.col]));
          if (c !== 0) return o.asc ? c : -c;
        }
        return 0;
      });
      return builder;
    });
    builder.limit = vi.fn((n: number) => {
      rows = rows.slice(0, n);
      return builder;
    });
    builder.then = (
      onfulfilled?: ((v: { data: unknown; error: unknown }) => unknown) | null,
      onrejected?: ((e: unknown) => unknown) | null,
    ) =>
      Promise.resolve(
        errors[table] ? { data: null, error: errors[table] } : { data: rows, error: null },
      ).then(onfulfilled, onrejected);
    return builder;
  });
  return { from } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

const competition = (overrides: Row) => ({
  title: "大会",
  end_date: null,
  place: null,
  pool_type: 1,
  team_id: null,
  entry_status: "before",
  ...overrides,
});

const style = { id: 2, name_jp: "100m自由形", distance: 100, style: "Fr" };

describe("useNextCompetitionQuery", () => {
  it("一番近い大会と、その大会の自分のエントリー・取り消していない目標を返す", async () => {
    const supabase = createFilterableSupabase({
      competitions: [
        competition({ id: "past", date: day(-1) }),
        competition({ id: "later", date: day(20) }),
        competition({ id: "next", date: day(12) }),
      ],
      entries: [
        {
          id: "e-mine",
          competition_id: "next",
          user_id: "me",
          style_id: 2,
          entry_time: 56.2,
          is_relaying: false,
          style,
        },
        {
          id: "e-other",
          competition_id: "next",
          user_id: "other",
          style_id: 2,
          entry_time: 50,
          style,
        },
      ],
      goals: [
        {
          id: "g-active",
          user_id: "me",
          competition_id: "next",
          style_id: 2,
          target_time: 55.5,
          status: "active",
        },
        {
          id: "g-cancel",
          user_id: "me",
          competition_id: "next",
          style_id: 3,
          target_time: 60,
          status: "cancelled",
        },
        {
          id: "g-other",
          user_id: "other",
          competition_id: "next",
          style_id: 2,
          target_time: 50,
          status: "active",
        },
      ],
    });

    const { result } = renderQueryHook(() => useNextCompetitionQuery(supabase, "me"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.competition.id).toBe("next");
    expect(result.current.data?.entries.map((e) => e.id)).toEqual(["e-mine"]);
    expect(result.current.data?.entries[0]?.style).toEqual(style);
    expect(result.current.data?.goals.map((g) => g.id)).toEqual(["g-active"]);
  });

  it("エントリーの is_relaying を取得する (抜けるとリレー行に個人のベスト・目標が付く)", async () => {
    const selects: Record<string, string[]> = {};
    const supabase = createFilterableSupabase(
      {
        competitions: [competition({ id: "next", date: day(3) })],
        entries: [
          {
            id: "r",
            competition_id: "next",
            user_id: "me",
            style_id: 2,
            entry_time: null,
            is_relaying: true,
            style,
          },
        ],
        goals: [],
      },
      selects,
    );
    const { result } = renderQueryHook(() => useNextCompetitionQuery(supabase, "me"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(selects.entries?.[0]).toMatch(/\bis_relaying\b/);
    expect(result.current.data?.entries[0]?.is_relaying).toBe(true);
  });

  it("個人種目を先に、リレーを後ろに並べる", async () => {
    const supabase = createFilterableSupabase({
      competitions: [competition({ id: "next", date: day(3) })],
      entries: [
        {
          id: "relay",
          competition_id: "next",
          user_id: "me",
          style_id: 1,
          entry_time: null,
          is_relaying: true,
          style,
        },
        {
          id: "im",
          competition_id: "next",
          user_id: "me",
          style_id: 21,
          entry_time: null,
          is_relaying: false,
          style,
        },
        {
          id: "fr",
          competition_id: "next",
          user_id: "me",
          style_id: 3,
          entry_time: null,
          is_relaying: false,
          style,
        },
      ],
      goals: [],
    });
    const { result } = renderQueryHook(() => useNextCompetitionQuery(supabase, "me"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.entries.map((e) => e.id)).toEqual(["fr", "im", "relay"]);
  });

  it("エントリーが無い大会は entries と goals を空で返す", async () => {
    const supabase = createFilterableSupabase({
      competitions: [competition({ id: "next", date: day(3) })],
      entries: [],
      goals: [
        {
          id: "g",
          user_id: "me",
          competition_id: "next",
          style_id: 2,
          target_time: 1,
          status: "active",
        },
      ],
    });
    const { result } = renderQueryHook(() => useNextCompetitionQuery(supabase, "me"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({
      competition: { id: "next" },
      entries: [],
      goals: [],
    });
  });

  it("他人のエントリーがあっても、締切済みのチーム大会は飛ばす", async () => {
    const supabase = createFilterableSupabase({
      competitions: [
        competition({ id: "closed", date: day(2), team_id: "t", entry_status: "closed" }),
        competition({ id: "open", date: day(5), team_id: "t", entry_status: "open" }),
      ],
      entries: [
        {
          id: "e",
          competition_id: "closed",
          user_id: "other",
          style_id: 2,
          entry_time: null,
          style,
        },
      ],
      goals: [],
    });
    const { result } = renderQueryHook(() => useNextCompetitionQuery(supabase, "me"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.competition.id).toBe("open");
  });

  it("開催中の複数日大会を選ぶ", async () => {
    const supabase = createFilterableSupabase({
      competitions: [competition({ id: "multi", date: day(-1), end_date: day(1) })],
      entries: [],
      goals: [],
    });
    const { result } = renderQueryHook(() => useNextCompetitionQuery(supabase, "me"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.competition.id).toBe("multi");
  });

  it("予定の大会が無ければ null", async () => {
    const supabase = createFilterableSupabase({
      competitions: [competition({ id: "past", date: day(-3) })],
      entries: [],
      goals: [],
    });
    const { result } = renderQueryHook(() => useNextCompetitionQuery(supabase, "me"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(null);
  });
});

describe("useUnrecordedCompetitionsQuery", () => {
  it("エントリーしたのに記録が無い、終わった大会だけを返す", async () => {
    const supabase = createFilterableSupabase({
      competitions: [
        competition({ id: "unrecorded", title: "未入力", date: day(-4) }),
        competition({ id: "recorded", date: day(-5) }),
        competition({ id: "not-entered", date: day(-6) }),
        competition({ id: "today", date: day(0) }),
        competition({ id: "multi-ongoing", date: day(-1), end_date: day(0) }),
        competition({ id: "too-old", date: day(-31) }),
        competition({ id: "other-recorded", date: day(-7) }),
      ],
      entries: [
        { competition_id: "unrecorded", user_id: "me" },
        { competition_id: "recorded", user_id: "me" },
        { competition_id: "today", user_id: "me" },
        { competition_id: "multi-ongoing", user_id: "me" },
        { competition_id: "too-old", user_id: "me" },
        { competition_id: "other-recorded", user_id: "me" },
        { competition_id: "not-entered", user_id: "other" },
      ],
      records: [
        { competition_id: "recorded", user_id: "me" },
        { competition_id: "other-recorded", user_id: "other" },
      ],
    });

    const { result } = renderQueryHook(() => useUnrecordedCompetitionsQuery(supabase, "me"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      { competitionId: "unrecorded", competitionName: "未入力", competitionDate: day(-4) },
      { competitionId: "other-recorded", competitionName: "大会", competitionDate: day(-7) },
    ]);
  });

  it("30日前の大会は含める", async () => {
    const supabase = createFilterableSupabase({
      competitions: [competition({ id: "edge", date: day(-30) })],
      entries: [{ competition_id: "edge", user_id: "me" }],
      records: [],
    });
    const { result } = renderQueryHook(() => useUnrecordedCompetitionsQuery(supabase, "me"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((c) => c.competitionId)).toEqual(["edge"]);
  });
});

const practiceLog = (overrides: Row) => ({
  style: "Fr",
  swim_category: "Swim",
  distance: 100,
  rep_count: 1,
  set_count: 1,
  circle: null,
  created_at: "2026-01-01T00:00:00Z",
  practice_times: [],
  ...overrides,
});

describe("useLastPracticeQuery", () => {
  it("今日までで自分のメニューがある最新の練習を、自分のメニューだけ付けて返す", async () => {
    const supabase = createFilterableSupabase({
      practices: [
        // 明日の練習は対象外
        {
          id: "future",
          date: day(1),
          title: null,
          place: null,
          created_at: "1",
          practice_logs: [practiceLog({ id: "lf", user_id: "me" })],
        },
        // 他人のメニューだけのチーム練習は対象外
        {
          id: "others",
          date: day(0),
          title: null,
          place: null,
          created_at: "2",
          practice_logs: [practiceLog({ id: "lo", user_id: "other" })],
        },
        // 管理者が作ったチーム練習に自分のメニューがある
        {
          id: "team",
          date: day(-1),
          title: "チーム練",
          place: null,
          created_at: "3",
          practice_logs: [
            practiceLog({ id: "l-mine", user_id: "me" }),
            practiceLog({ id: "l-other", user_id: "other" }),
          ],
        },
        {
          id: "old",
          date: day(-5),
          title: null,
          place: null,
          created_at: "4",
          practice_logs: [practiceLog({ id: "lold", user_id: "me" })],
        },
      ],
    });

    const { result } = renderQueryHook(() => useLastPracticeQuery(supabase, "me"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.id).toBe("team");
    expect(result.current.data?.practice_logs.map((l) => l.id)).toEqual(["l-mine"]);
  });

  it("メニューは !inner で埋め込む (無いと、自分のメニューが無い最新の練習が空のメニューで返る)", async () => {
    const selects: Record<string, string[]> = {};
    const supabase = createFilterableSupabase({ practices: [] }, selects);
    const { result } = renderQueryHook(() => useLastPracticeQuery(supabase, "me"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(selects.practices?.[0]).toMatch(/practice_logs!inner\s*\(/);
  });

  it("同じ日に複数あれば、後から登録した練習を選ぶ", async () => {
    const supabase = createFilterableSupabase({
      practices: [
        {
          id: "morning",
          date: day(0),
          title: null,
          place: null,
          created_at: "2026-01-01T06:00:00Z",
          practice_logs: [practiceLog({ id: "l1", user_id: "me" })],
        },
        {
          id: "evening",
          date: day(0),
          title: null,
          place: null,
          created_at: "2026-01-01T18:00:00Z",
          practice_logs: [practiceLog({ id: "l2", user_id: "me" })],
        },
      ],
    });
    const { result } = renderQueryHook(() => useLastPracticeQuery(supabase, "me"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe("evening");
  });

  it("自分のメニューがある練習が無ければ null", async () => {
    const supabase = createFilterableSupabase({ practices: [] });
    const { result } = renderQueryHook(() => useLastPracticeQuery(supabase, "me"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe("usePracticeSoonQuery", () => {
  const run = async (tables: Tables) => {
    const { result } = renderQueryHook(() =>
      usePracticeSoonQuery(createFilterableSupabase(tables), "me"),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    return result.current.data;
  };

  it("明日に個人練習があれば true", async () => {
    expect(
      await run({ practices: [{ id: "p", date: day(1), team_id: null, user_id: "me" }] }),
    ).toBe(true);
  });

  it("練習が明後日以降なら false", async () => {
    expect(
      await run({ practices: [{ id: "p", date: day(2), team_id: null, user_id: "me" }] }),
    ).toBe(false);
  });

  it("他人の個人練習は数えない (RLS で見えても)", async () => {
    expect(
      await run({ practices: [{ id: "p", date: day(0), team_id: null, user_id: "other" }] }),
    ).toBe(false);
  });

  it("今日のチーム練習は、欠席と回答していなければ true", async () => {
    expect(
      await run({
        practices: [{ id: "tp", date: day(0), team_id: "t1" }],
        team_attendance: [
          { practice_id: "tp", user_id: "me", status: "present" },
          { practice_id: "tp", user_id: "other", status: "absent" },
        ],
      }),
    ).toBe(true);
  });

  it("欠席したチーム練習があっても、ほかに出るチーム練習か個人練習があれば true", async () => {
    expect(
      await run({
        practices: [
          { id: "absent", date: day(0), team_id: "t1" },
          { id: "present", date: day(1), team_id: "t1" },
        ],
        team_attendance: [{ practice_id: "absent", user_id: "me", status: "absent" }],
      }),
    ).toBe(true);
    expect(
      await run({
        practices: [
          { id: "absent", date: day(0), team_id: "t1" },
          { id: "own", date: day(1), team_id: null, user_id: "me" },
        ],
        team_attendance: [{ practice_id: "absent", user_id: "me", status: "absent" }],
      }),
    ).toBe(true);
  });

  it("欠席と回答したチーム練習しか無ければ false", async () => {
    expect(
      await run({
        practices: [{ id: "tp", date: day(0), team_id: "t1" }],
        team_attendance: [{ practice_id: "tp", user_id: "me", status: "absent" }],
      }),
    ).toBe(false);
  });
});

describe("useDashboardInitialCard", () => {
  it("次の大会の取得に失敗しても決まったことにし、大会が無いものとして選ぶ", async () => {
    const supabase = createFilterableSupabase(
      { practices: [{ id: "p", date: day(0), team_id: null, user_id: "me" }] },
      {},
      { competitions: new Error("network") },
    );
    const { result } = renderQueryHook(() => useDashboardInitialCard(supabase, "me"));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.initialIndex).toBe(1);
  });

  it("大会が明日なら、練習の予定があっても次の大会 (0)", async () => {
    const supabase = createFilterableSupabase({
      competitions: [competition({ id: "c", date: day(1) })],
      entries: [],
      practices: [{ id: "p", date: day(0), team_id: null, user_id: "me" }],
    });
    const { result } = renderQueryHook(() => useDashboardInitialCard(supabase, "me"));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.initialIndex).toBe(0);
  });
});
