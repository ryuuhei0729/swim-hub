/**
 * apps/shared/__tests__/api/goals.bestTimePoolType.test.ts
 *
 * Sprint Contract 検証観点:
 *   [V-API-03] getBestTimeForStyle(userId, styleId, poolType) が
 *              records.pool_type = poolType でフィルタしてから最速タイムを取る。
 *   [V-API-04] 該当水路の記録が無ければ null を返す (?? 0 フォールバック禁止)。
 *   [V-API-05] createGoal 経由で startTime 省略時、対象大会の pool_type が
 *              getBestTimeForStyle に渡っている。
 *
 * 背景:
 *   ユーザー裁定「初期タイム(自己ベスト)は長水路・短水路を区別する」。
 *   getBestTimeForStyle は poolType を渡すと records.pool_type = poolType で
 *   絞り込んでから .order("time").limit(1) する。
 *
 * トートロジー回避方針:
 *   モックの records クエリビルダーは `.eq()` に渡された引数 (カラム名・値) を
 *   全て記録し、"pool_type" というカラム名と実際の poolType 値の両方を assert する。
 */

import { describe, it, expect, vi } from "vitest";
import { GoalAPI } from "../../api/goals";
import type { CreateGoalInput } from "../../types/goals";

type TrackingBuilder = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
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
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.single = vi.fn().mockResolvedValue(singleResult);
  return { builder, eqCalls };
}

/**
 * createGoal をテストするための supabase モック。
 * "records" (ベストタイム取得) と "goals" (insert) の両方をこの1つの from に集約する。
 */
function createGoalApiForCreateGoal(recordsSingleResult: { data: unknown; error: unknown }) {
  const records = createRecordsTrackingBuilder(recordsSingleResult);
  const goalsBuilder = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { id: "goal-1", start_time: recordsSingleResult.data ? (recordsSingleResult.data as { time: number }).time : null },
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
  const api = new GoalAPI(supabase as never);
  return { api, records, goalsBuilder };
}

describe("GoalAPI.getBestTimeForStyle - pool_type 分離", () => {
  it("poolType=1 (長水路) を渡すと records.pool_type=1 の行のみから最速タイムを取得する (records.pool_type=0 の方が速くても採用しない)", async () => {
    // モックは「対象水路 (pool_type=1) に絞った後の最速」を返す体で応答する。
    // records.pool_type=0 の方が速い行が実在しても、DB 側で eq("pool_type", 1) に
    // 絞られていれば返らないはずなので、ここでは「絞り込み後の値」を返す。
    const { api, records } = createGoalApiForCreateGoal({ data: { time: 62.5 }, error: null });

    const goal = await api.createGoal({
      styleId: 1,
      targetTime: 60,
      competitionId: "comp-1",
      poolType: 1,
    } as CreateGoalInput & { competitionId: string });

    expect(records.eqCalls).toContainEqual(["pool_type", 1]);
    expect(goal).toBeDefined();
  });

  it("poolType=0 (短水路) を渡すと records.pool_type=0 の行のみから最速タイムを取得する", async () => {
    const { api, records } = createGoalApiForCreateGoal({ data: { time: 58.2 }, error: null });

    await api.createGoal({
      styleId: 1,
      targetTime: 55,
      competitionId: "comp-1",
      poolType: 0,
    } as CreateGoalInput & { competitionId: string });

    expect(records.eqCalls).toContainEqual(["pool_type", 0]);
  });

  it("対象水路に該当する records が0件の場合は null を返す (?? 0 のような業務的に無意味な既定値へフォールバックしない)", async () => {
    // PGRST116 = single() が0件のときに返す Supabase の「not found」エラーコード
    const { api, records, goalsBuilder } = createGoalApiForCreateGoal({
      data: null,
      error: { code: "PGRST116" },
    });

    await api.createGoal({
      styleId: 1,
      targetTime: 55,
      competitionId: "comp-1",
      poolType: 1,
      // startTime を省略 = getBestTimeForStyle 経由
    } as CreateGoalInput & { competitionId: string });

    expect(records.eqCalls).toContainEqual(["pool_type", 1]);
    // start_time に 0 が代入されず null のまま insert された (?? 0 フォールバック禁止)。
    expect(goalsBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({ start_time: null }));
  });

  it("createGoal 経由で startTime 省略時、target 大会の pool_type が getBestTimeForStyle に渡っている (呼び出し引数レベルで確認)", async () => {
    const { api, records } = createGoalApiForCreateGoal({ data: { time: 70 }, error: null });

    await api.createGoal({
      styleId: 2,
      targetTime: 60,
      competitionId: "comp-2",
      poolType: 1,
      // startTime を渡さない = getBestTimeForStyle が呼ばれる
    } as CreateGoalInput & { competitionId: string });

    expect(records.eqCalls).toContainEqual(["style_id", 2]);
    expect(records.eqCalls).toContainEqual(["pool_type", 1]);
  });

  /**
   * v1.1 修正 (Developer/PM 指摘、弱いオラクル):
   * 旧テスト「poolType を渡さない場合は records.pool_type によるフィルタを
   * 一切かけない (後方互換フォールバック)」は `records.eqCalls` に "pool_type" が
   * 無いことしか見ておらず、以下の2つの実装のどちらでも green になっていた:
   *   (旧・禁止された設計) records に絞り込み無しで問い合わせる
   *   (v1.1 の設計)         records に一切問い合わせない (呼び出し自体が無い)
   * どちらでも `eqCalls` に "pool_type" が無い点は同じなので、旧テストは
   * v1.1 で禁止された設計を検出できない (トートロジー)。
   * 「水路が分からない場合は自己ベストを取得しない」という仕様を明示的に要求するため、
   * ここでは createGoal ではなく calculateGoalProgress を対象に、
   * 「goal.competition が null のとき null を返し、records には一切問い合わせない
   * (from("records") 自体が呼ばれない)」ことを直接 assert する。
   */
  it("goal.competition が null (大会情報なし) のとき calculateGoalProgress は null を返し、records に一切問い合わせない", async () => {
    const recordsFromCalls: string[] = [];
    const goalsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "goal-1",
          style_id: 1,
          start_time: 70,
          target_time: 60,
          competition: null,
        },
        error: null,
      }),
    };
    const from = vi.fn((table: string) => {
      if (table === "goals") return goalsBuilder;
      recordsFromCalls.push(table);
      throw new Error(`unexpected table: ${table}`);
    });
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from,
    };
    const api = new GoalAPI(supabase as never);

    const progress = await api.calculateGoalProgress("goal-1");

    expect(progress).toBeNull();
    expect(recordsFromCalls).not.toContain("records");
    expect(from).not.toHaveBeenCalledWith("records");
  });
});
