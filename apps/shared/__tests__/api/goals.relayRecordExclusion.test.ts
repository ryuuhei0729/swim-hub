/**
 * apps/shared/__tests__/api/goals.relayRecordExclusion.test.ts
 *
 * 実機で発見された不具合の回帰ガード:
 *   未達成の目標 (50m自由形・短水路、目標23.45・初期23.80) が達成率100%と誤表示された。
 *   原因: 短水路の自己記録にリレーの引き継ぎ (is_relaying=true, 23.19) があり、
 *   GoalAPI.getBestTimeForStyle がこれを自己ベストとして拾っていた。
 *   「ベストタイム取得」ボタン (RecordAPI.getBestTimes 経由) は元々引き継ぎを除いて
 *   23.80 を返しており、目標管理側の3箇所 (getBestTimeForStyle /
 *   checkTimeAchievement の大会記録側 / hasTimeRecords の大会記録側) だけが
 *   引き継ぎを含めてしまっていた (アプリ内で「引き継ぎタイムの扱い」が2箇所で
 *   食い違っていた状態)。
 *
 * 本ファイルは:
 *  1. 3箇所それぞれが records への問い合わせに `.eq("is_relaying", false)` を
 *     含めることを、引数を記録するモックで確認する。
 *  2. 「引き継ぎの記録の方が速い」という実際のバグ条件を再現する振る舞いモックで、
 *     自己ベスト (calculateGoalProgress 経由)・time型マイルストーンの達成
 *     (checkMilestoneAchievement 経由)・「記録あり」判定 (updateAllMilestoneStatuses
 *     経由の hasTimeRecords) のいずれも引き継ぎの記録を無視することを確認する。
 *  3. 「ベストタイム取得」ボタンが使う RecordAPI.getBestTimes() の集計結果と、
 *     GoalAPI 内部の自己ベスト (calculateGoalProgress が使う値) が、
 *     引き継ぎを含むデータに対して一致することを確認する (今回のずれの再発防止)。
 *
 * トートロジー防止メモ: 引数記録だけでなく、実際にフィルタを適用する振る舞いモックで
 * 「達成/未達成」「進捗の値」という観測可能な結果まで固定する。
 */
import { describe, expect, it, vi } from "vitest";
import { GoalAPI } from "../../api/goals";
import { RecordAPI, aggregateBestTimes } from "../../api/records";
import type { Milestone, MilestoneTimeParams } from "../../types/goals";

// =============================================================================
// 1. 引数記録モック (トートロジー回避方針: feedback_swimhub_test_mock_discards_query_args.md)
// =============================================================================

type TrackingBuilder = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: (onFulfilled?: unknown, onRejected?: unknown) => Promise<unknown>;
};

function createTrackingBuilder(data: unknown, error: unknown = null) {
  const eqCalls: Array<[string, unknown]> = [];
  const builder = {} as TrackingBuilder;
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn((col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return builder;
  });
  builder.ilike = vi.fn(() => builder);
  builder.lte = vi.fn(() => builder);
  // updateAllMilestoneStatuses のマイルストーン一覧取得 (.in("status", [...])) 用。
  builder.in = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.single = vi.fn().mockResolvedValue({ data, error });
  builder.then = ((onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve({ data, error }).then(onFulfilled, onRejected)) as TrackingBuilder["then"];
  return { builder, eqCalls };
}

function createMockMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: "milestone-1",
    goal_id: "goal-1",
    title: "テストマイルストーン",
    type: "time",
    params: { distance: 50, target_time: 23.45, style: "Fr", swim_category: "Swim" } as MilestoneTimeParams,
    deadline: null,
    status: "in_progress",
    achieved_at: null,
    reflection_done: false,
    reflection_note: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("GoalAPI — 引き継ぎタイム (is_relaying=true) を自己ベスト・達成判定から除外する", () => {
  describe("getBestTimeForStyle (createGoal 経由で間接的に確認)", () => {
    it("records への問い合わせに .eq('is_relaying', false) が含まれる", async () => {
      const { builder, eqCalls } = createTrackingBuilder({ time: 23.8 }, null);
      const goalsBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: "goal-1", start_time: 23.8 }, error: null }),
      };
      const from = vi.fn((table: string) => {
        if (table === "records") return builder;
        if (table === "goals") return goalsBuilder;
        throw new Error(`unexpected table: ${table}`);
      });
      const supabase = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
        from,
      };
      const api = new GoalAPI(supabase as never);

      await api.createGoal({
        styleId: 2,
        targetTime: 23.45,
        competitionId: "comp-1",
        poolType: 0,
      } as never);

      expect(eqCalls).toContainEqual(["is_relaying", false]);
    });
  });

  describe("checkMilestoneAchievement → checkTimeAchievement (大会記録側)", () => {
    it("records への問い合わせに .eq('is_relaying', false) が含まれる", async () => {
      const { builder: practiceLogs } = createTrackingBuilder([], null);
      const { builder: records, eqCalls } = createTrackingBuilder([], null);
      const from = vi.fn((table: string) => {
        if (table === "practice_logs") return practiceLogs;
        if (table === "records") return records;
        throw new Error(`unexpected table: ${table}`);
      });
      const supabase = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
        from,
      };
      const api = new GoalAPI(supabase as never);

      await api.checkMilestoneAchievement(createMockMilestone());

      expect(eqCalls).toContainEqual(["is_relaying", false]);
    });
  });

  describe("hasRecordsForMilestone → hasTimeRecords (大会記録側)", () => {
    it("records への問い合わせに .eq('is_relaying', false) が含まれる", async () => {
      // このフローでは records への問い合わせが2回発生する:
      //   1回目 = checkTimeAchievement (達成判定、is_relaying フィルタは既存)
      //   2回目 = hasTimeRecords (「記録あり」判定、本テストの対象)
      // 両方を同じ eqCalls 配列に集約すると、1回目 (未変更) の呼び出し引数が
      // 2回目 (検証対象) の欠落を覆い隠してしまう (トートロジー)。
      // そのため呼び出しごとに個別の eqCalls を記録し、2回目だけを検証する。
      const milestone = createMockMilestone({ status: "not_started" });
      const { builder: milestonesList } = createTrackingBuilder([milestone], null);
      const { builder: practiceLogs } = createTrackingBuilder([], null);
      const recordsEqCallsPerInvocation: Array<Array<[string, unknown]>> = [];
      let recordsCallCount = 0;
      const from = vi.fn((table: string) => {
        if (table === "milestones") return milestonesList;
        if (table === "practice_logs") return practiceLogs;
        if (table === "records") {
          recordsCallCount += 1;
          const { builder, eqCalls } = createTrackingBuilder([], null);
          recordsEqCallsPerInvocation.push(eqCalls);
          return builder;
        }
        throw new Error(`unexpected table: ${table}`);
      });
      const supabase = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
        from,
      };
      const api = new GoalAPI(supabase as never);

      await api.updateAllMilestoneStatuses("user-1");

      // records への問い合わせが (checkTimeAchievement, hasTimeRecords の) 2回
      // 発生していることを前提として、2回目 (hasTimeRecords) を検証する。
      expect(recordsCallCount).toBe(2);
      const hasTimeRecordsEqCalls = recordsEqCallsPerInvocation[1];
      expect(hasTimeRecordsEqCalls).toContainEqual(["is_relaying", false]);
    });
  });
});

// =============================================================================
// 2. 実際にフィルタを適用する振る舞いモック (実バグの再現条件: 引き継ぎの方が速い)
// =============================================================================

type RecordRow = {
  id: string;
  user_id: string;
  style_id: number;
  pool_type: number;
  is_relaying: boolean;
  time: number;
  styles: { distance: number; style: string };
};

/** `.eq()`/`.ilike()`/`.lte()` を実際にデータへ適用する records 用フェイクテーブル */
function makeFilteringRecordsBuilder(rows: RecordRow[]) {
  return () => {
    const filters: Array<(row: RecordRow) => boolean> = [];
    let orderCol: string | null = null;
    let ascending = true;
    let asSingle = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((col: string, value: unknown) => {
      filters.push((row) => resolvePath(row, col) === value);
      return builder;
    });
    builder.ilike = vi.fn((col: string, value: string) => {
      filters.push(
        (row) => String(resolvePath(row, col)).toLowerCase() === String(value).toLowerCase(),
      );
      return builder;
    });
    builder.lte = vi.fn((col: string, value: number) => {
      filters.push((row) => Number(resolvePath(row, col)) <= value);
      return builder;
    });
    builder.order = vi.fn((col: string, opts?: { ascending?: boolean }) => {
      orderCol = col;
      ascending = opts?.ascending ?? true;
      return builder;
    });
    builder.limit = vi.fn(() => builder);
    builder.single = vi.fn(() => {
      asSingle = true;
      return builder;
    });
    builder.then = (resolve: (v: unknown) => void) => {
      let filtered = rows.filter((row) => filters.every((f) => f(row)));
      if (orderCol) {
        const col = orderCol as string;
        filtered = [...filtered].sort((a, b) => {
          const diff = Number(resolvePath(a, col)) - Number(resolvePath(b, col));
          return ascending ? diff : -diff;
        });
      }
      if (asSingle) {
        const row = filtered[0];
        if (!row) return resolve({ data: null, error: { code: "PGRST116" } });
        return resolve({ data: row, error: null });
      }
      return resolve({ data: filtered, error: null });
    };
    return builder;
  };

  function resolvePath(row: RecordRow, path: string): unknown {
    return path.split(".").reduce<unknown>((acc, key) => (acc as Record<string, unknown>)?.[key], row);
  }
}

describe("実バグの再現条件 (引き継ぎの記録の方が速い) での振る舞い", () => {
  const relayingRow: RecordRow = {
    id: "record-relay",
    user_id: "user-1",
    style_id: 2,
    pool_type: 0,
    is_relaying: true,
    time: 23.19,
    styles: { distance: 50, style: "Fr" },
  };
  const ownRow: RecordRow = {
    id: "record-own",
    user_id: "user-1",
    style_id: 2,
    pool_type: 0,
    is_relaying: false,
    time: 23.8,
    styles: { distance: 50, style: "Fr" },
  };

  it("calculateGoalProgress: 引き継ぎ (23.19) を無視し、自己記録 (23.80=初期タイムのまま) を基準にすると進捗0%になる (100%と誤表示しない)", async () => {
    const goalsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "goal-1",
          style_id: 2,
          start_time: 23.8,
          target_time: 23.45,
          competition: { pool_type: 0 },
        },
        error: null,
      }),
    };
    const recordsBuilder = makeFilteringRecordsBuilder([relayingRow, ownRow]);
    const from = vi.fn((table: string) => {
      if (table === "goals") return goalsBuilder;
      if (table === "records") return recordsBuilder();
      throw new Error(`unexpected table: ${table}`);
    });
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from,
    };
    const api = new GoalAPI(supabase as never);

    const progress = await api.calculateGoalProgress("goal-1");

    // 自己ベスト (23.80) は初期タイムと同値なので改善量0 → 進捗0%。
    // 引き継ぎ (23.19) を採用していれば target_time (23.45) を上回り 100% 超になっていたはず。
    expect(progress).toBe(0);
  });

  it("checkMilestoneAchievement (time型): 引き継ぎの記録だけでは達成にならない", async () => {
    const milestone = createMockMilestone({
      params: { distance: 50, target_time: 23.45, style: "Fr", swim_category: "Swim" } as MilestoneTimeParams,
    });
    const practiceLogsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const recordsBuilder = makeFilteringRecordsBuilder([relayingRow]);
    const from = vi.fn((table: string) => {
      if (table === "practice_logs") return practiceLogsBuilder;
      if (table === "records") return recordsBuilder();
      throw new Error(`unexpected table: ${table}`);
    });
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from,
    };
    const api = new GoalAPI(supabase as never);

    const result = await api.checkMilestoneAchievement(milestone);

    expect(result.achieved).toBe(false);
  });

  it("[非退行] 自己記録 (23.80) だけでは目標タイム23.45を満たさず未達成のまま", async () => {
    const milestone = createMockMilestone({
      params: { distance: 50, target_time: 23.45, style: "Fr", swim_category: "Swim" } as MilestoneTimeParams,
    });
    const practiceLogsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const recordsBuilder = makeFilteringRecordsBuilder([ownRow]);
    const from = vi.fn((table: string) => {
      if (table === "practice_logs") return practiceLogsBuilder;
      if (table === "records") return recordsBuilder();
      throw new Error(`unexpected table: ${table}`);
    });
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from,
    };
    const api = new GoalAPI(supabase as never);

    const result = await api.checkMilestoneAchievement(milestone);

    expect(result.achieved).toBe(false);
  });

  it("[非退行] 自己記録の方が速い場合 (23.30) は正しく達成になる", async () => {
    const milestone = createMockMilestone({
      params: { distance: 50, target_time: 23.45, style: "Fr", swim_category: "Swim" } as MilestoneTimeParams,
    });
    const fastOwnRow: RecordRow = { ...ownRow, id: "record-fast-own", time: 23.3 };
    const practiceLogsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const recordsBuilder = makeFilteringRecordsBuilder([relayingRow, fastOwnRow]);
    const from = vi.fn((table: string) => {
      if (table === "practice_logs") return practiceLogsBuilder;
      if (table === "records") return recordsBuilder();
      throw new Error(`unexpected table: ${table}`);
    });
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from,
    };
    const api = new GoalAPI(supabase as never);

    const result = await api.checkMilestoneAchievement(milestone);

    expect(result.achieved).toBe(true);
    expect(result.achievementData?.recordId).toBe("record-fast-own");
  });

  it("hasRecordsForMilestone (not_started → in_progress の判定): 引き継ぎの記録だけでは「記録あり」にならない", async () => {
    const milestone = createMockMilestone({ status: "not_started" });
    const milestonesListBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [milestone], error: null }),
    };
    // checkTimeAchievement (practice_logs 側) は .order() を、hasTimeRecords
    // (practice_logs 側) は .limit() を終端に使うため、両方を解決可能にしておく。
    const practiceLogsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const recordsBuilder = makeFilteringRecordsBuilder([relayingRow]);
    let updateCalled = false;
    const from = vi.fn((table: string) => {
      if (table === "milestones") {
        return {
          ...milestonesListBuilder,
          update: vi.fn(() => {
            updateCalled = true;
            return { eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: milestone, error: null }) };
          }),
        };
      }
      if (table === "practice_logs") return practiceLogsBuilder;
      if (table === "records") return recordsBuilder();
      throw new Error(`unexpected table: ${table}`);
    });
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from,
    };
    const api = new GoalAPI(supabase as never);

    await api.updateAllMilestoneStatuses("user-1");

    // 「記録あり」と判定されていれば not_started → in_progress の update が呼ばれるはず。
    // 引き継ぎしか無いので呼ばれない (= not_started のまま)。
    expect(updateCalled).toBe(false);
  });
});

// =============================================================================
// 3. 「ベストタイム取得」ボタン (RecordAPI.getBestTimes) との整合性
// =============================================================================

describe("「ベストタイム取得」ボタンとの整合性 (再発防止)", () => {
  it("引き継ぎを含むデータで、RecordAPI.aggregateBestTimes の非引き継ぎベストと GoalAPI.calculateGoalProgress が使う自己ベストが一致する", async () => {
    // RecordAPI.getBestTimes() が内部で使う aggregateBestTimes に、
    // GoalAPI.calculateGoalProgress のテストと全く同じレコード群を渡し、
    // 両者が同じ「自己ベスト」(23.80、引き継ぎの23.19は除く) に一致することを確認する。
    const sourceRecords = [
      {
        id: "record-relay",
        time: 23.19,
        created_at: "2025-01-01T00:00:00Z",
        pool_type: 0,
        is_relaying: true,
        style_id: 2,
        styles: { name_jp: "自由形", distance: 50 },
      },
      {
        id: "record-own",
        time: 23.8,
        created_at: "2025-01-02T00:00:00Z",
        pool_type: 0,
        is_relaying: false,
        style_id: 2,
        styles: { name_jp: "自由形", distance: 50 },
      },
    ];

    const bestTimes = aggregateBestTimes(sourceRecords);
    const button = bestTimes.find((bt) => bt.style_id === 2 && bt.pool_type === 0);
    expect(button?.time).toBe(23.8);

    // GoalAPI 側 (calculateGoalProgress が使う getBestTimeForStyle) も同じ23.80を返す。
    const goalsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "goal-1", style_id: 2, start_time: 23.8, target_time: 23.45, competition: { pool_type: 0 } },
        error: null,
      }),
    };
    const recordsBuilder = makeFilteringRecordsBuilder([
      { id: "record-relay", user_id: "user-1", style_id: 2, pool_type: 0, is_relaying: true, time: 23.19, styles: { distance: 50, style: "Fr" } },
      { id: "record-own", user_id: "user-1", style_id: 2, pool_type: 0, is_relaying: false, time: 23.8, styles: { distance: 50, style: "Fr" } },
    ]);
    const from = vi.fn((table: string) => {
      if (table === "goals") return goalsBuilder;
      if (table === "records") return recordsBuilder();
      throw new Error(`unexpected table: ${table}`);
    });
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from,
    };
    const api = new GoalAPI(supabase as never);

    // start_time と自己ベストが同値 (23.80) → 進捗0%になることで、間接的に
    // GoalAPI 側も 23.80 を自己ベストとして採用していることを確認する
    // (23.19 を採用していれば進捗は0%を超える)。
    const progress = await api.calculateGoalProgress("goal-1");
    expect(progress).toBe(0);
  });
});

// RecordAPI は直接インスタンス化していないが、aggregateBestTimes が RecordAPI と
// 同じ集計ロジックの唯一の定義元であることを明示するために import している
// (import 自体が「経路の一致」を示すドキュメントとして機能する)。
void RecordAPI;
