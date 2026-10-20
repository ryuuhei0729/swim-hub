/**
 * apps/shared/__tests__/api/goals.bestTimePoolType.test.ts
 *
 * 検証観点:
 *   [V-API-03] 自己ベストの取得 (getBestTimeForStyle) は records.pool_type = 目標の大会の水路で
 *              絞ってから最速タイムを取る。一覧・詳細の「現在のベスト」(GoalAPI.getGoalCurrentBestTime) 経由で確認する。
 *              (フォームのベストタイムラベルは Contract v4 でエントリーと同じ getBestTimeForEntry に変わった)
 *   [V-API-04] 該当水路の記録が無ければ null を返す (?? 0 フォールバック禁止)。
 *   [V-API-05] 水路が分からない目標 (大会情報なし) は、水路で絞らない取得をせず records を一切引かない。
 *              getGoalCurrentBestTime 経由で goals.currentBestTime.test.ts が固定している (ここでは重複させない)。
 *   [SC5]      createGoal は初期タイムを自動取得しない (水路を渡されても records を引かない)。
 *
 * 背景:
 *   ユーザー裁定「自己ベストは長水路・短水路を区別する」。目標の初期タイムは
 *   Sprint Contract v2 で全廃され、ベストはフォームのラベル表示だけに使う。
 *
 * トートロジー回避方針:
 *   モックの records クエリビルダーは `.eq()` に渡された引数 (カラム名・値) を
 *   全て記録し、"pool_type" というカラム名と実際の poolType 値の両方を assert する。
 */

import { describe, it, expect, vi } from "vitest";
import { GoalAPI } from "../../api/goals";

type TrackingBuilder = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  gt: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};

function createRecordsTrackingBuilder(singleResult: { data: unknown; error: unknown }) {
  const eqCalls: Array<[string, unknown]> = [];
  const builder = {} as TrackingBuilder;
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn((col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return builder;
  });
  // D7: 0秒の行を除く .gt("time", 0) (条件の確認は goals.currentBestTime.test.ts)
  builder.gt = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.single = vi.fn().mockResolvedValue(singleResult);
  return { builder, eqCalls };
}

/** 目標 (種目 styleId・大会の水路 poolType) の現在のベストを引く API。records の条件を記録する */
function createApiForBestTime(
  recordsSingleResult: { data: unknown; error: unknown },
  goal: { styleId: number; poolType: number },
) {
  const records = createRecordsTrackingBuilder(recordsSingleResult);
  const goalsBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { style_id: goal.styleId, competition: { pool_type: goal.poolType } },
      error: null,
    }),
  };
  const from = vi.fn((table: string) => {
    if (table === "records") return records.builder;
    if (table === "goals") return goalsBuilder;
    throw new Error(`unexpected table: ${table}`);
  });
  const supabase = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
    from,
  };
  return { api: new GoalAPI(supabase as never), records, from };
}

describe("GoalAPI.getGoalCurrentBestTime - pool_type 分離", () => {
  it("大会が長水路 (pool_type=1) の目標は records.pool_type=1 の行のみから最速タイムを取得する", async () => {
    // モックは「対象水路 (pool_type=1) に絞った後の最速」を返す体で応答する。
    const { api, records } = createApiForBestTime({ data: { time: 62.5 }, error: null }, { styleId: 1, poolType: 1 });

    await expect(api.getGoalCurrentBestTime("goal-1")).resolves.toBe(62.5);
    expect(records.eqCalls).toContainEqual(["pool_type", 1]);
    expect(records.eqCalls).not.toContainEqual(["pool_type", 0]);
  });

  it("大会が短水路 (pool_type=0) の目標は records.pool_type=0 の行のみから最速タイムを取得する (0 を falsy として落とさない)", async () => {
    const { api, records } = createApiForBestTime({ data: { time: 58.2 }, error: null }, { styleId: 1, poolType: 0 });

    await expect(api.getGoalCurrentBestTime("goal-1")).resolves.toBe(58.2);
    expect(records.eqCalls).toContainEqual(["pool_type", 0]);
    expect(records.eqCalls).not.toContainEqual(["pool_type", 1]);
  });

  it("対象水路に該当する records が0件の場合は null を返す (?? 0 のような業務的に無意味な既定値へフォールバックしない)", async () => {
    // PGRST116 = single() が0件のときに返す Supabase の「not found」エラーコード
    const { api, records } = createApiForBestTime({ data: null, error: { code: "PGRST116" } }, { styleId: 1, poolType: 1 });

    await expect(api.getGoalCurrentBestTime("goal-1")).resolves.toBeNull();
    expect(records.eqCalls).toContainEqual(["pool_type", 1]);
  });

  it("目標の種目と大会の水路の両方が records の条件に渡る (呼び出し引数レベルで確認)", async () => {
    const { api, records } = createApiForBestTime({ data: { time: 70 }, error: null }, { styleId: 2, poolType: 1 });

    await api.getGoalCurrentBestTime("goal-1");

    expect(records.eqCalls).toContainEqual(["style_id", 2]);
    expect(records.eqCalls).toContainEqual(["pool_type", 1]);
  });
});

describe("[SC5] createGoal はベスト (初期タイム) を自動取得しない", () => {
  function createApiForCreateGoal() {
    const tables: string[] = [];
    const goalInserts: unknown[] = [];
    const from = vi.fn((table: string) => {
      tables.push(table);
      if (table === "goals") {
        return {
          insert: vi.fn((v: unknown) => {
            goalInserts.push(v);
            return { select: () => ({ single: async () => ({ data: { id: "goal-1" }, error: null }) }) };
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    });
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from,
    };
    return { api: new GoalAPI(supabase as never), tables, goalInserts };
  }

  it.each([0, 1])("水路 (%s) を渡されても records を引かず、goals だけに insert する", async (poolType) => {
    const { api, tables, goalInserts } = createApiForCreateGoal();

    // 旧 CreateGoalInput.poolType は初期タイムの自動取得専用だった (残す場合も records を引いてはいけない)
    await api.createGoal({
      userId: "user-1",
      styleId: 2,
      targetTime: 60,
      competitionId: "comp-1",
      poolType,
    } as never);

    expect(tables).toEqual(["goals"]);
    expect(goalInserts).toEqual([
      { user_id: "user-1", competition_id: "comp-1", style_id: 2, target_time: 60, status: "active" },
    ]);
  });
});
