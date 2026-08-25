/**
 * useUnsubmittedEntriesQuery テスト (Reviewer Critical C-1 再評価: Phase 5b)
 *
 * 契約 (PM実測確認済み修正):
 *   `apps/shared/hooks/queries/notifications.ts` の `useUnsubmittedEntriesQuery` は
 *   大会取得クエリに `.gte("date", todayStr)` (todayStr = format(new Date(), "yyyy-MM-dd"))
 *   を追加し、過去日の大会を「エントリー未提出」催促の対象から除外する。
 *   境界は「今日は含める」= `isCompetitionDateInPast` と同じ判定基準。
 *
 * find/grep 実測: 本フックの専用テストは今回まで存在しなかった (既存の参照は
 * apps/mobile/components/dashboard/__tests__/TeamAnnouncementsSection.expandToggle.test.tsx
 * の全面モック `useUnsubmittedEntriesQuery: () => ({ data: [] })` のみで、本体の
 * クエリロジックは未検証)。そのため新規ファイルとして作成する。
 *
 * トートロジー防止:
 * - 共有モック `apps/shared/__mocks__/supabase.ts` の `createMockQueryBuilder` は
 *   `.gte()` 等のフィルタメソッドをチェーン可能にするだけで、実際にはデータを
 *   フィルタしない (常に固定の `queryData` をそのまま返す)。そのため、この共有
 *   モックをそのまま使うと「過去日を除外している」ことを一切検証せずに green に
 *   なるトートロジーに陥る。
 * - 本ファイルでは (a) `.gte("date", todayStr)` が実際に呼ばれたことをスパイで検証する
 *   のに加えて、(b) 日付文字列を実際に比較してフィルタする専用の軽量モック
 *   (`createDateFilterableSupabase`) を自前で用意し、過去日が本当にデータから
 *   除外されること・今日/未来日が実際に残ることを「返り値」で検証する。
 * - 日付は `new Date()` からの相対 (subDays/addDays) で生成し、固定日付をハードコードしない。
 */

import { describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { addDays, format, subDays } from "date-fns";
import { useUnsubmittedEntriesQuery } from "../../../hooks/queries/notifications";
import { renderQueryHook } from "../../utils/test-utils";

const NOW = new Date();
const TODAY_STR = format(NOW, "yyyy-MM-dd");
const YESTERDAY_STR = format(subDays(NOW, 1), "yyyy-MM-dd");
const TOMORROW_STR = format(addDays(NOW, 1), "yyyy-MM-dd");

interface CompetitionRow {
  id: string;
  title: string;
  date: string;
  team_id: string;
  entry_status: string;
}

interface EntryRow {
  competition_id: string;
  user_id: string;
}

interface FilterCall {
  table: string;
  method: string;
  args: unknown[];
}

/**
 * `.eq()`/`.gte()`/`.in()` を実際にデータへ適用する軽量 Supabase モック。
 * 共有モック (`createMockQueryBuilder`) と異なり、フィルタが呼ばれた時点で
 * 保持データを実際に絞り込む。`.order()` は date 昇順ソートのみ簡易対応する。
 */
function createDateFilterableSupabase(tables: {
  competitions: CompetitionRow[];
  entries: EntryRow[];
}) {
  const calls: FilterCall[] = [];

  const from = vi.fn((table: "competitions" | "entries") => {
    let rows: Record<string, unknown>[] = [...(tables[table] as unknown as Record<string, unknown>[])];

    const builder: Record<string, unknown> = {};
    const record = (method: string, args: unknown[]) => calls.push({ table, method, args });

    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((col: string, val: unknown) => {
      record("eq", [col, val]);
      rows = rows.filter((r) => r[col] === val);
      return builder;
    });
    builder.gte = vi.fn((col: string, val: unknown) => {
      record("gte", [col, val]);
      rows = rows.filter((r) => (r[col] as string) >= (val as string));
      return builder;
    });
    builder.in = vi.fn((col: string, vals: unknown[]) => {
      record("in", [col, vals]);
      rows = rows.filter((r) => vals.includes(r[col]));
      return builder;
    });
    builder.order = vi.fn((col: string, opts?: { ascending?: boolean }) => {
      record("order", [col, opts]);
      const ascending = opts?.ascending !== false;
      rows = [...rows].sort((a, b) => {
        const av = String(a[col]);
        const bv = String(b[col]);
        return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      return builder;
    });
    // useUnsubmittedEntriesQuery は `await supabase.from(...)...order(...)` のように
    // クエリビルダーを直接 await する (Supabase-js のクエリビルダーは thenable)。
    builder.then = (
      onfulfilled?: ((v: { data: unknown; error: unknown }) => unknown) | null,
      onrejected?: ((e: unknown) => unknown) | null,
    ) => Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);

    return builder;
  });

  return { supabase: { from } as unknown as import("@supabase/supabase-js").SupabaseClient, calls };
}

const makeCompetition = (overrides: Partial<CompetitionRow> = {}): CompetitionRow => ({
  id: "c-1",
  title: "テスト大会",
  date: TODAY_STR,
  team_id: "team-1",
  entry_status: "open",
  ...overrides,
});

const TEAMS = [{ team_id: "team-1", team: { name: "テストチーム" } }];

describe("useUnsubmittedEntriesQuery (Reviewer C-1 再評価)", () => {
  it("過去日の大会 (entry_status=open) は返さない", async () => {
    const { supabase } = createDateFilterableSupabase({
      competitions: [makeCompetition({ id: "c-past", date: YESTERDAY_STR })],
      entries: [],
    });

    const { result } = renderQueryHook(() =>
      useUnsubmittedEntriesQuery(supabase, "user-1", TEAMS),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });

  it("今日の大会 (境界値) は返す (今日は過去扱いしない)", async () => {
    const { supabase } = createDateFilterableSupabase({
      competitions: [makeCompetition({ id: "c-today", date: TODAY_STR })],
      entries: [],
    });

    const { result } = renderQueryHook(() =>
      useUnsubmittedEntriesQuery(supabase, "user-1", TEAMS),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]).toMatchObject({ competitionId: "c-today" });
  });

  it("未来日 + entry_status=open は従来通り返す", async () => {
    const { supabase } = createDateFilterableSupabase({
      competitions: [makeCompetition({ id: "c-future", date: TOMORROW_STR })],
      entries: [],
    });

    const { result } = renderQueryHook(() =>
      useUnsubmittedEntriesQuery(supabase, "user-1", TEAMS),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]).toMatchObject({ competitionId: "c-future" });
  });

  it("過去日・今日・未来日が混在するとき、今日と未来日のみ返す (過去日のみ除外)", async () => {
    const { supabase } = createDateFilterableSupabase({
      competitions: [
        makeCompetition({ id: "c-past", date: YESTERDAY_STR }),
        makeCompetition({ id: "c-today", date: TODAY_STR }),
        makeCompetition({ id: "c-future", date: TOMORROW_STR }),
      ],
      entries: [],
    });

    const { result } = renderQueryHook(() =>
      useUnsubmittedEntriesQuery(supabase, "user-1", TEAMS),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const ids = (result.current.data ?? []).map((d) => d.competitionId).sort();
    expect(ids).toEqual(["c-future", "c-today"]);
  });

  it("既にエントリー済みの大会は日付に関わらず除外される (既存の未提出フィルタは非退行)", async () => {
    const { supabase } = createDateFilterableSupabase({
      competitions: [
        makeCompetition({ id: "c-today-submitted", date: TODAY_STR }),
        makeCompetition({ id: "c-future-unsubmitted", date: TOMORROW_STR }),
      ],
      entries: [{ competition_id: "c-today-submitted", user_id: "user-1" }],
    });

    const { result } = renderQueryHook(() =>
      useUnsubmittedEntriesQuery(supabase, "user-1", TEAMS),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const ids = (result.current.data ?? []).map((d) => d.competitionId);
    expect(ids).toEqual(["c-future-unsubmitted"]);
  });

  // .gte 呼び出しそのものの配線確認 (共有モックが .gte を無視してもすり抜けないよう、
  // 実際の引数まで固定日付ハードコードなしで検証する)
  it("大会クエリに .gte('date', 今日の日付文字列) が呼ばれる", async () => {
    const { supabase, calls } = createDateFilterableSupabase({
      competitions: [makeCompetition({ id: "c-1", date: TODAY_STR })],
      entries: [],
    });

    const { result } = renderQueryHook(() =>
      useUnsubmittedEntriesQuery(supabase, "user-1", TEAMS),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const gteCall = calls.find((c) => c.table === "competitions" && c.method === "gte");
    expect(gteCall, ".gte が competitions クエリで呼ばれていない").toBeDefined();
    expect(gteCall?.args).toEqual(["date", TODAY_STR]);
  });
});
