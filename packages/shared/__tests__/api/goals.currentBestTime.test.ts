/**
 * packages/shared/__tests__/api/goals.currentBestTime.test.ts
 *
 * GoalAPI.getGoalCurrentBestTime — 一覧・詳細の「現在のベスト」(private の getBestTimeForStyle を使う)。
 *  - 対象大会と同じ水路・同じ種目・リレー引き継ぎ以外・time > 0 (Sprint Contract v3 D7) の最速タイム
 *  - 水路が分からない目標では水路で絞らない取得をせず null を返す
 *  - 0秒の行は records の条件 (.gt("time", 0)) で除く。0秒の行があっても有効な記録 (58.00) が隠れない
 * フォームのベストタイムラベルは v4 でエントリーと同じ出し方 (getBestTimeForEntry) に変わり、
 * この関数は通らない (D7 の time > 0 は一覧・詳細の「現在のベスト」と RPC にだけ残る)。
 */
import { describe, expect, it, vi } from "vitest";
import { GoalAPI } from "../../api/goals";

function createGoalsBuilder(data: unknown, error: unknown = null) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
  return builder;
}

function createRecordsBuilder(data: unknown, error: unknown = null) {
  const eqCalls: Array<[string, unknown]> = [];
  const gtCalls: Array<[string, unknown]> = [];
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return builder;
    }),
    gt: vi.fn((col: string, val: unknown) => {
      gtCalls.push([col, val]);
      return builder;
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
  return { builder, eqCalls, gtCalls };
}

type RecordRow = { user_id: string; style_id: number; pool_type: number; is_relaying: boolean; time: number };

/**
 * records テーブルのフェイク: 渡された eq / gt を全て AND で適用し、order (time) / single に従う。
 * 条件を足し忘れると、0秒の行が最速として返る (実バグの再現条件)。
 */
function createFilteringRecords(rows: RecordRow[]) {
  const filters: Array<(r: RecordRow) => boolean> = [];
  let ascending: boolean | null = null;
  let single = false;
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (col: keyof RecordRow, v: unknown) => {
    filters.push((r) => r[col] === v);
    return builder;
  };
  builder.gt = (col: keyof RecordRow, v: number) => {
    filters.push((r) => Number(r[col]) > v);
    return builder;
  };
  builder.order = (col: string, opts?: { ascending?: boolean }) => {
    expect(col).toBe("time");
    ascending = opts?.ascending ?? true;
    return builder;
  };
  builder.limit = () => builder;
  builder.single = () => {
    single = true;
    return builder;
  };
  builder.then = (resolve: (v: unknown) => unknown) => {
    let hit = rows.filter((r) => filters.every((f) => f(r)));
    if (ascending !== null) hit = [...hit].sort((a, b) => (ascending ? a.time - b.time : b.time - a.time));
    const first = hit[0];
    const result = !single
      ? { data: hit, error: null }
      : first
        ? { data: { time: first.time }, error: null }
        : { data: null, error: { code: "PGRST116" } };
    return Promise.resolve(result).then(resolve);
  };
  return builder;
}

function createSupabase(goalsBuilder: unknown, recordsBuilder?: unknown) {
  const from = vi.fn((table: string) => {
    if (table === "goals") return goalsBuilder;
    if (table === "records" && recordsBuilder) return recordsBuilder;
    throw new Error(`unexpected table: ${table}`);
  });
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
    from,
  };
}

describe("GoalAPI.getGoalCurrentBestTime", () => {
  it("対象大会と同じ水路・同じ種目・リレー引き継ぎ以外の自己ベストを返す", async () => {
    const goals = createGoalsBuilder({ style_id: 2, competition: { pool_type: 0 } });
    const records = createRecordsBuilder({ time: 23.8 });
    const supabase = createSupabase(goals, records.builder);

    const result = await new GoalAPI(supabase as never).getGoalCurrentBestTime("goal-1");

    expect(result).toBe(23.8);
    // 水路は goals → competitions の結合から読む。結合を落とすと本番では常に「水路不明 = null」になる
    expect(goals.select).toHaveBeenCalledWith(expect.stringContaining("competition:competitions(pool_type)"));
    expect(goals.eq).toHaveBeenCalledWith("id", "goal-1");
    expect(records.eqCalls).toEqual([
      ["user_id", "user-1"],
      ["style_id", 2],
      ["pool_type", 0],
      ["is_relaying", false],
    ]);
    // D7: 0秒の行はベストにしない
    expect(records.gtCalls).toEqual([["time", 0]]);
    expect(records.builder.order).toHaveBeenCalledWith("time", { ascending: true });
    expect(records.builder.limit).toHaveBeenCalledWith(1);
  });

  it("大会の結合が配列で返っても水路を読める", async () => {
    const goals = createGoalsBuilder({ style_id: 2, competition: [{ pool_type: 1 }] });
    const records = createRecordsBuilder({ time: 24.1 });
    const supabase = createSupabase(goals, records.builder);

    const result = await new GoalAPI(supabase as never).getGoalCurrentBestTime("goal-1");

    expect(result).toBe(24.1);
    expect(records.eqCalls).toContainEqual(["pool_type", 1]);
  });

  it("大会情報が無い (水路が分からない) 目標は records を問い合わせず null を返す", async () => {
    const goals = createGoalsBuilder({ style_id: 2, competition: null });
    const supabase = createSupabase(goals);

    const result = await new GoalAPI(supabase as never).getGoalCurrentBestTime("goal-1");

    expect(result).toBeNull();
    expect(supabase.from).not.toHaveBeenCalledWith("records");
  });

  it("記録が無い (PGRST116) 場合は null を返す", async () => {
    const goals = createGoalsBuilder({ style_id: 2, competition: { pool_type: 0 } });
    const records = createRecordsBuilder(null, { code: "PGRST116" });
    const supabase = createSupabase(goals, records.builder);

    await expect(
      new GoalAPI(supabase as never).getGoalCurrentBestTime("goal-1"),
    ).resolves.toBeNull();
  });

  it("records の取得に失敗したらエラーを投げる (記録なしの null と区別できるように)", async () => {
    const dbError = { code: "57014", message: "statement timeout" };
    const goals = createGoalsBuilder({ style_id: 2, competition: { pool_type: 1 } });
    const records = createRecordsBuilder(null, dbError);
    const supabase = createSupabase(goals, records.builder);

    await expect(new GoalAPI(supabase as never).getGoalCurrentBestTime("goal-1")).rejects.toBe(dbError);
  });

  it("目標の取得に失敗したらエラーを投げる (0 や null で記録なしと区別できなくしない)", async () => {
    const goalError = { code: "42501", message: "permission denied" };
    const goals = createGoalsBuilder(null, goalError);
    const supabase = createSupabase(goals);

    await expect(new GoalAPI(supabase as never).getGoalCurrentBestTime("goal-1")).rejects.toBe(
      goalError,
    );
  });

  it("未ログインならエラーを投げる", async () => {
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      from: vi.fn(),
    };

    await expect(
      new GoalAPI(supabase as never).getGoalCurrentBestTime("goal-1"),
    ).rejects.toThrow("認証が必要です");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("D7: 0秒の行はベストにしない (getGoalCurrentBestTime)", () => {
  const row = (o: Partial<RecordRow>): RecordRow => ({ user_id: "user-1", style_id: 2, pool_type: 1, is_relaying: false, time: 60, ...o });

  function apis(rows: RecordRow[]) {
    const from = vi.fn((table: string) => {
      if (table === "records") return createFilteringRecords(rows);
      if (table === "goals") return createGoalsBuilder({ style_id: 2, competition: { pool_type: 1 } });
      throw new Error(`unexpected table: ${table}`);
    });
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from,
    };
    return new GoalAPI(supabase as never);
  }

  it("0秒の行と 58.00 の行があれば 58.00 を返す (0秒が有効な記録を隠さない)", async () => {
    const api = apis([row({ time: 0 }), row({ time: 58 }), row({ time: 61.2 })]);

    await expect(api.getGoalCurrentBestTime("goal-1")).resolves.toBe(58);
  });

  it("0秒の行しか無ければ null (記録なし)", async () => {
    const api = apis([row({ time: 0 }), row({ time: 0 })]);

    await expect(api.getGoalCurrentBestTime("goal-1")).resolves.toBeNull();
  });

  it("[非退行] 0秒の行の扱いを変えても、別の水路・リレー引き継ぎ・別ユーザーの速い記録は採らない", async () => {
    const api = apis([
      row({ time: 0 }),
      row({ time: 57, pool_type: 0 }),
      row({ time: 55, is_relaying: true }),
      row({ time: 50, user_id: "other-user" }),
      row({ time: 59.5 }),
    ]);

    await expect(api.getGoalCurrentBestTime("goal-1")).resolves.toBe(59.5);
  });
});

