/**
 * 予定タブ (TeamSchedule) の一覧取得を模した supabase モック。
 *
 * fetchTeamPractices / fetchTeamCompetitions の形だけに対応する:
 *   - 今日以降: from(table).select(...).eq("team_id", id).gte("date", today).order("date", asc)
 *   - 過去    : from(table).select(...).eq("team_id", id).lt("date", today)
 *                 .order("date", desc).range(from, to)
 *   - 1 件    : from(table).select(...).eq("team_id", id).eq("id", rowId).maybeSingle()
 *                 (外から予定の詳細を開くとき。fetchTeam*ById)
 * 行は日付で振り分け・並べ替え・切り出しを実際に行う。
 * `nextList` に関数を入れると、次の取得 1 回の結果をテストから制御できる (保留・失敗)。
 */
import { vi } from "vitest";

export type ScheduleTable = "practices" | "competitions";
export type ScheduleWhen = "upcoming" | "past";

export interface ScheduleMockRow {
  id: string;
  date: string;
  [key: string]: unknown;
}

export type ScheduleListResult = { data: ScheduleMockRow[] | null; error: unknown };

export interface ScheduleListCall {
  table: ScheduleTable;
  when: ScheduleWhen;
  today: string;
  from?: number;
  to?: number;
}

export function buildScheduleSupabaseMock(initial: {
  practices?: ScheduleMockRow[];
  competitions?: ScheduleMockRow[];
}) {
  const state = {
    rows: {
      practices: initial.practices ?? [],
      competitions: initial.competitions ?? [],
    } as Record<ScheduleTable, ScheduleMockRow[]>,
    calls: [] as ScheduleListCall[],
    /** 1 件取得 (fetchTeam*ById) の呼び出し */
    byIdCalls: [] as { table: ScheduleTable; teamId: string; id: string }[],
    nextList: null as null | ((call: ScheduleListCall) => Promise<ScheduleListResult> | null),
  };

  const resolve = (call: ScheduleListCall): Promise<ScheduleListResult> => {
    state.calls.push(call);
    const override = state.nextList?.(call);
    if (override) {
      state.nextList = null;
      return override;
    }
    const rows = state.rows[call.table]
      .filter((row) => (call.when === "upcoming" ? row.date >= call.today : row.date < call.today))
      .sort((a, b) =>
        call.when === "upcoming" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date),
      );
    const data =
      call.from !== undefined && call.to !== undefined ? rows.slice(call.from, call.to + 1) : rows;
    return Promise.resolve({ data, error: null });
  };

  const from = vi.fn((table: ScheduleTable) => ({
    select: () => ({
      eq: (_teamColumn: string, teamId: string) => ({
        eq: (_idColumn: string, id: string) => ({
          maybeSingle: () => {
            state.byIdCalls.push({ table, teamId, id });
            const row = state.rows[table].find((candidate) => candidate.id === id) ?? null;
            return Promise.resolve({ data: row, error: null });
          },
        }),
        gte: (_column: string, today: string) => ({
          order: () => resolve({ table, when: "upcoming", today }),
        }),
        lt: (_column: string, today: string) => ({
          order: () => ({
            range: (start: number, end: number) =>
              resolve({ table, when: "past", today, from: start, to: end }),
          }),
        }),
      }),
    }),
  }));

  return { supabase: { from }, state };
}

export function practiceRow(id: string, title: string, date: string): ScheduleMockRow {
  return {
    id,
    user_id: "member-1",
    date,
    title,
    place: null,
    note: null,
    created_at: `${date}T00:00:00Z`,
    created_by: "member-1",
    practice_logs: [],
  };
}

export function competitionRow(id: string, title: string, date: string): ScheduleMockRow {
  return {
    id,
    user_id: "admin-1",
    team_id: "team-1",
    title,
    date,
    end_date: null,
    place: "市民プール",
    pool_type: 0,
    entry_status: null,
    note: null,
    created_at: `${date}T00:00:00Z`,
    created_by: "admin-1",
    entries: [],
  };
}
