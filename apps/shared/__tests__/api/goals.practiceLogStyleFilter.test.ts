/**
 * apps/shared/__tests__/api/goals.practiceLogStyleFilter.test.ts
 *
 * Sprint Contract 検証観点:
 *   [V-API-01] practice_logs.style へのフィルタが canonical (toStyleCode) 経由の
 *              値で行われ、STYLE_CODE_TO_JAPANESE 相当の日本語変換を経由しない。
 *   [V-API-02] toStyleCode が null を返すケース(不正な params.style)では
 *              practice_logs へのクエリを送らず未達成/存在なしとして早期returnする。
 *
 * 背景 (C1, PM確定版 Sprint Contract):
 *   practice_logs.style は canonical コード ("Fr" 等) で格納されているが、旧実装は
 *   STYLE_CODE_TO_JAPANESE で日本語("自由形")に変換してから .eq("style", styleJp) して
 *   おり、本番の practice_logs には日本語文字列が存在しないため常に0件ヒットしていた。
 *
 * 対象メソッド (6箇所、apps/shared/api/goals.ts):
 *   - checkTimeAchievement / checkRepsTimeAchievement / checkSetAchievement (practice_logs 経路)
 *   - hasTimeRecords / hasRepsTimeRecords / hasSetRecords
 *
 * トートロジー回避方針:
 *   supabase クライアントのモックは `.eq()` / `.ilike()` に渡された「引数」を配列に
 *   記録する (eqCalls / ilikeCalls)。戻り値の分岐だけを見るモックは「呼ばれたことを
 *   確認したつもりで実は引数を見ていない」トートロジーに陥るため使わない
 *   (feedback_swimhub_test_mock_discards_query_args.md 参照)。
 */

import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GoalAPI } from "../../api/goals";
import type { Milestone, MilestoneRepsTimeParams, MilestoneSetParams, MilestoneTimeParams } from "../../types/goals";

// -----------------------------------------------------------------------------
// トラッキング用クエリビルダー: .eq() / .ilike() の呼び出し引数を捨てずに記録する。
// 単一選択 (.single()) とリスト選択 (await 直 = thenable) の両方をサポートする。
// -----------------------------------------------------------------------------
type TrackingBuilder = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: (onFulfilled?: unknown, onRejected?: unknown) => Promise<unknown>;
};

function createTrackingBuilder(
  data: unknown,
  error: unknown = null,
): { builder: TrackingBuilder; eqCalls: Array<[string, unknown]>; ilikeCalls: Array<[string, unknown]> } {
  const eqCalls: Array<[string, unknown]> = [];
  const ilikeCalls: Array<[string, unknown]> = [];
  const builder = {} as TrackingBuilder;
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn((col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return builder;
  });
  builder.ilike = vi.fn((col: string, val: unknown) => {
    ilikeCalls.push([col, val]);
    return builder;
  });
  builder.gte = vi.fn(() => builder);
  builder.lte = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.single = vi.fn().mockResolvedValue({ data, error });
  builder.then = ((onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve({ data, error }).then(onFulfilled, onRejected)) as TrackingBuilder["then"];
  return { builder, eqCalls, ilikeCalls };
}

const createMockMilestone = (overrides: Partial<Milestone> = {}): Milestone => ({
  id: "milestone-1",
  goal_id: "goal-1",
  title: "テストマイルストーン",
  type: "time",
  params: { distance: 100, target_time: 60, style: "Fr", swim_category: "Swim" } as MilestoneTimeParams,
  deadline: null,
  status: "not_started",
  achieved_at: null,
  reflection_done: false,
  reflection_note: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  ...overrides,
});

/**
 * checkMilestoneAchievement 経由のテスト用 supabase モックを組み立てる。
 * checkMilestoneAchievement は milestone 行を引数でそのまま受け取り、
 * milestones テーブルへの再取得は行わない。
 */
function createCheckAchievementMock(_milestone: Milestone) {
  const practiceLogs = createTrackingBuilder([], null);
  const records = createTrackingBuilder([], null);

  const from = vi.fn((table: string) => {
    if (table === "practice_logs") return practiceLogs.builder;
    if (table === "records") return records.builder;
    throw new Error(`unexpected table: ${table}`);
  });

  const supabase = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
    from,
  };

  return { supabase, from, practiceLogs, records };
}

describe("GoalAPI - practice_logs.style フィルタの canonical 化 (C1)", () => {
  describe("checkMilestoneAchievement → checkTimeAchievement", () => {
    it("practice_logsへの問い合わせは .ilike('style', toStyleCode(params.style)) で行われ、日本語には変換されない", async () => {
      const milestone = createMockMilestone({
        type: "time",
        params: { distance: 100, target_time: 60, style: "Fr", swim_category: "Swim" } as MilestoneTimeParams,
      });
      const { supabase, practiceLogs } = createCheckAchievementMock(milestone);
      const api = new GoalAPI(supabase as never);

      await api.checkMilestoneAchievement(milestone);

      expect(practiceLogs.ilikeCalls).toContainEqual(["style", "Fr"]);
      // 日本語 ("自由形" 等) は一切渡っていないこと、かつ .eq("style", ...) では
      // 呼ばれていないこと (canonical 一致は ilike 経由のみで行う設計)。
      expect(practiceLogs.eqCalls.some(([col]) => col === "style")).toBe(false);
      expect(practiceLogs.ilikeCalls.some(([, val]) => typeof val === "string" && /[぀-ヿ]/.test(val))).toBe(
        false,
      );
    });

    it("params.style が 'fr' (小文字) でも canonical 'Fr' として問い合わせる", async () => {
      const milestone = createMockMilestone({
        type: "time",
        params: { distance: 100, target_time: 60, style: "fr", swim_category: "Swim" } as MilestoneTimeParams,
      });
      const { supabase, practiceLogs } = createCheckAchievementMock(milestone);
      const api = new GoalAPI(supabase as never);

      await api.checkMilestoneAchievement(milestone);

      expect(practiceLogs.ilikeCalls).toContainEqual(["style", "Fr"]);
    });

    it("toStyleCode が null を返す不正な params.style の場合、practice_logs へのクエリを送らず achieved: false を返す", async () => {
      const milestone = createMockMilestone({
        type: "time",
        params: { distance: 100, target_time: 60, style: "%invalid%", swim_category: "Swim" } as MilestoneTimeParams,
      });
      const { supabase, from } = createCheckAchievementMock(milestone);
      const api = new GoalAPI(supabase as never);

      const result = await api.checkMilestoneAchievement(milestone);

      expect(result.achieved).toBe(false);
      expect(from).not.toHaveBeenCalledWith("practice_logs");
      expect(from).not.toHaveBeenCalledWith("records");
    });
  });

  describe("checkMilestoneAchievement → checkRepsTimeAchievement", () => {
    it("practice_logs.style は canonical + ilike で問い合わせる", async () => {
      const milestone = createMockMilestone({
        type: "reps_time",
        params: {
          distance: 100,
          reps: 4,
          sets: 1,
          target_average_time: 65,
          style: "Br",
          swim_category: "Swim",
          circle: 90,
        } as MilestoneRepsTimeParams,
      });
      const { supabase, practiceLogs } = createCheckAchievementMock(milestone);
      const api = new GoalAPI(supabase as never);

      await api.checkMilestoneAchievement(milestone);

      expect(practiceLogs.ilikeCalls).toContainEqual(["style", "Br"]);
      expect(practiceLogs.eqCalls.some(([col]) => col === "style")).toBe(false);
    });

    it("toStyleCode が null を返す不正な params.style の場合、practice_logs へのクエリを送らない", async () => {
      const milestone = createMockMilestone({
        type: "reps_time",
        params: {
          distance: 100,
          reps: 4,
          sets: 1,
          target_average_time: 65,
          style: "unknown-style",
          swim_category: "Swim",
          circle: 90,
        } as MilestoneRepsTimeParams,
      });
      const { supabase, from } = createCheckAchievementMock(milestone);
      const api = new GoalAPI(supabase as never);

      const result = await api.checkMilestoneAchievement(milestone);

      expect(result.achieved).toBe(false);
      expect(from).not.toHaveBeenCalledWith("practice_logs");
    });
  });

  describe("checkMilestoneAchievement → checkSetAchievement", () => {
    it("practice_logs.style は canonical + ilike で問い合わせる", async () => {
      const milestone = createMockMilestone({
        type: "set",
        params: {
          distance: 100,
          reps: 4,
          sets: 3,
          style: "Fly",
          swim_category: "Swim",
          circle: 90,
        } as MilestoneSetParams,
      });
      const { supabase, practiceLogs } = createCheckAchievementMock(milestone);
      const api = new GoalAPI(supabase as never);

      await api.checkMilestoneAchievement(milestone);

      expect(practiceLogs.ilikeCalls).toContainEqual(["style", "Fly"]);
      expect(practiceLogs.eqCalls.some(([col]) => col === "style")).toBe(false);
    });

    it("toStyleCode が null を返す不正な params.style の場合、practice_logs へのクエリを送らない", async () => {
      const milestone = createMockMilestone({
        type: "set",
        params: {
          distance: 100,
          reps: 4,
          sets: 3,
          style: "",
          swim_category: "Swim",
          circle: 90,
        } as MilestoneSetParams,
      });
      const { supabase, from } = createCheckAchievementMock(milestone);
      const api = new GoalAPI(supabase as never);

      const result = await api.checkMilestoneAchievement(milestone);

      expect(result.achieved).toBe(false);
      expect(from).not.toHaveBeenCalledWith("practice_logs");
    });
  });

  // ---------------------------------------------------------------------------
  // hasRecordsForMilestone (private) は updateAllMilestoneStatuses 経由でのみ到達可能。
  // checkMilestoneAchievement は spyOn で achieved:false に固定し、
  // hasTimeRecords/hasRepsTimeRecords/hasSetRecords 単体のクエリ引数のみを検証する。
  // ---------------------------------------------------------------------------
  function createUpdateAllStatusesMock(milestone: Milestone) {
    const milestonesList = createTrackingBuilder([milestone], null);
    const practiceLogs = createTrackingBuilder([], null);
    const records = createTrackingBuilder([], null);

    const from = vi.fn((table: string) => {
      if (table === "milestones") return milestonesList.builder;
      if (table === "practice_logs") return practiceLogs.builder;
      if (table === "records") return records.builder;
      throw new Error(`unexpected table: ${table}`);
    });

    const supabase = { auth: { getUser: vi.fn() }, from };
    const api = new GoalAPI(supabase as never);
    vi.spyOn(api, "checkMilestoneAchievement").mockResolvedValue({ achieved: false });
    vi.spyOn(api, "updateMilestoneStatus").mockResolvedValue(milestone);

    return { api, from, practiceLogs, records };
  }

  describe("hasRecordsForMilestone → hasTimeRecords", () => {
    it("practice_logs.style は canonical + ilike で問い合わせる", async () => {
      const milestone = createMockMilestone({
        type: "time",
        status: "not_started",
        params: { distance: 100, target_time: 60, style: "Ba", swim_category: "Swim" } as MilestoneTimeParams,
      });
      const { api, practiceLogs } = createUpdateAllStatusesMock(milestone);

      await api.updateAllMilestoneStatuses("user-1");

      expect(practiceLogs.ilikeCalls).toContainEqual(["style", "Ba"]);
      expect(practiceLogs.eqCalls.some(([col]) => col === "style")).toBe(false);
    });

    it("toStyleCode が null を返す不正な params.style の場合、practice_logs へのクエリを送らない", async () => {
      const milestone = createMockMilestone({
        type: "time",
        status: "not_started",
        params: { distance: 100, target_time: 60, style: "invalid", swim_category: "Swim" } as MilestoneTimeParams,
      });
      const { api, from } = createUpdateAllStatusesMock(milestone);

      await api.updateAllMilestoneStatuses("user-1");

      expect(from).not.toHaveBeenCalledWith("practice_logs");
      expect(from).not.toHaveBeenCalledWith("records");
    });
  });

  describe("hasRecordsForMilestone → hasRepsTimeRecords", () => {
    it("practice_logs.style は canonical + ilike で問い合わせる", async () => {
      const milestone = createMockMilestone({
        type: "reps_time",
        status: "not_started",
        params: {
          distance: 100,
          reps: 4,
          sets: 1,
          target_average_time: 65,
          style: "IM",
          swim_category: "Swim",
          circle: 90,
        } as MilestoneRepsTimeParams,
      });
      const { api, practiceLogs } = createUpdateAllStatusesMock(milestone);

      await api.updateAllMilestoneStatuses("user-1");

      expect(practiceLogs.ilikeCalls).toContainEqual(["style", "IM"]);
      expect(practiceLogs.eqCalls.some(([col]) => col === "style")).toBe(false);
    });

    it("toStyleCode が null を返す不正な params.style の場合、practice_logs へのクエリを送らない", async () => {
      const milestone = createMockMilestone({
        type: "reps_time",
        status: "not_started",
        params: {
          distance: 100,
          reps: 4,
          sets: 1,
          target_average_time: 65,
          style: "*",
          swim_category: "Swim",
          circle: 90,
        } as MilestoneRepsTimeParams,
      });
      const { api, from } = createUpdateAllStatusesMock(milestone);

      await api.updateAllMilestoneStatuses("user-1");

      expect(from).not.toHaveBeenCalledWith("practice_logs");
    });
  });

  describe("hasRecordsForMilestone → hasSetRecords", () => {
    it("practice_logs.style は canonical + ilike で問い合わせる", async () => {
      const milestone = createMockMilestone({
        type: "set",
        status: "not_started",
        params: {
          distance: 100,
          reps: 4,
          sets: 3,
          style: "Br",
          swim_category: "Swim",
          circle: 90,
        } as MilestoneSetParams,
      });
      const { api, practiceLogs } = createUpdateAllStatusesMock(milestone);

      await api.updateAllMilestoneStatuses("user-1");

      expect(practiceLogs.ilikeCalls).toContainEqual(["style", "Br"]);
      expect(practiceLogs.eqCalls.some(([col]) => col === "style")).toBe(false);
    });

    it("toStyleCode が null を返す不正な params.style の場合、practice_logs へのクエリを送らない", async () => {
      const milestone = createMockMilestone({
        type: "set",
        status: "not_started",
        params: {
          distance: 100,
          reps: 4,
          sets: 3,
          style: "backstroke", // 英単語だが canonical キー ("Ba" 等) ではない
          swim_category: "Swim",
          circle: 90,
        } as MilestoneSetParams,
      });
      const { api, from } = createUpdateAllStatusesMock(milestone);

      await api.updateAllMilestoneStatuses("user-1");

      expect(from).not.toHaveBeenCalledWith("practice_logs");
    });
  });

  describe("[退行防止] STYLE_CODE_TO_JAPANESE / getStyleJapanese の削除確認", () => {
    it("STYLE_CODE_TO_JAPANESE 定数と getStyleJapanese 関数が apps/shared/api/goals.ts から削除されている", () => {
      const source = fs.readFileSync(path.join(__dirname, "../../api/goals.ts"), "utf-8");
      expect(source).not.toMatch(/STYLE_CODE_TO_JAPANESE/);
      expect(source).not.toMatch(/getStyleJapanese/);
    });
  });

  // ---------------------------------------------------------------------------
  // time型マイルストーンの practice_logs 問い合わせに swim_category の絞り込みを
  // 追加した回帰ガード。追加前は distance+style のみで絞っていたため、
  // 泳法カテゴリ (Swim/Pull/Kick) が違っても同じ distance+style の記録があれば
  // 達成扱いになっていた (例: キックの練習タイムでスイムの目標が達成扱いになる)。
  // ---------------------------------------------------------------------------
  describe("checkMilestoneAchievement → checkTimeAchievement: swim_category の絞り込み", () => {
    it("practice_logsへの問い合わせに .eq('swim_category', params.swim_category) が含まれる", async () => {
      const milestone = createMockMilestone({
        type: "time",
        params: { distance: 100, target_time: 60, style: "Fr", swim_category: "Swim" } as MilestoneTimeParams,
      });
      const { supabase, practiceLogs } = createCheckAchievementMock(milestone);
      const api = new GoalAPI(supabase as never);

      await api.checkMilestoneAchievement(milestone);

      expect(practiceLogs.eqCalls).toContainEqual(["swim_category", "Swim"]);
    });

    /**
     * 実際に DB がフィルタした場合と同じ挙動を再現する簡易モック
     * (eqCalls の記録だけでなく、記録した filter を実際にデータへ適用する)。
     * 「呼ばれたことは確認したが実際に絞り込まれるかは見ていない」トートロジーを避けるため、
     * ここだけは絞り込みの結果 (達成の有無) まで確認する。
     */
    function createFilteringPracticeLogsMock(
      rows: Array<{
        id: string;
        user_id: string;
        style: string;
        swim_category: string;
        distance: number;
        time: number;
      }>,
    ) {
      function makeBuilder() {
        const filters: Array<(row: (typeof rows)[number]) => boolean> = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const builder: any = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn((col: string, value: unknown) => {
          filters.push((row) => (row as unknown as Record<string, unknown>)[col] === value);
          return builder;
        });
        builder.ilike = vi.fn((col: string, value: string) => {
          filters.push(
            (row) =>
              String((row as unknown as Record<string, unknown>)[col]).toLowerCase() ===
              value.toLowerCase(),
          );
          return builder;
        });
        builder.order = vi.fn(() => builder);
        builder.then = (resolve: (v: unknown) => void) => {
          const filtered = rows.filter((row) => filters.every((f) => f(row)));
          const data = filtered.map((row) => ({
            id: row.id,
            practice_times: [{ time: row.time }],
          }));
          return resolve({ data, error: null });
        };
        return builder;
      }

      // records 側はこのテストでは対象データ無し (practice_logs だけで判定が決まる
      // ケースのみ扱う) だが、checkTimeAchievement は practice_logs で未達成だと
      // 必ず records へも問い合わせるため、実際のクエリと同じチェーン
      // (select/eq/ilike/lte/order/limit) を一通り受けられるスタブが必要。
      function makeEmptyRecordsBuilder() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const builder: any = {};
        for (const name of ["select", "eq", "ilike", "lte", "order", "limit"]) {
          builder[name] = vi.fn(() => builder);
        }
        builder.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
        return builder;
      }

      const supabase = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
        from: vi.fn((table: string) => {
          if (table === "practice_logs") return makeBuilder();
          return makeEmptyRecordsBuilder();
        }),
      };
      return supabase;
    }

    it("キックの練習タイムが速くても、スイムのタイム型マイルストーンは達成にならない", async () => {
      const milestone = createMockMilestone({
        type: "time",
        params: { distance: 100, target_time: 60, style: "Fr", swim_category: "Swim" } as MilestoneTimeParams,
      });
      // 該当する distance/style だが swim_category=Kick の速いタイムのみ存在する
      // (Swim のログは無い)。swim_category を絞らなければ誤って達成扱いになる。
      const supabase = createFilteringPracticeLogsMock([
        { id: "log-kick", user_id: "user-1", style: "Fr", swim_category: "Kick", distance: 100, time: 55 },
      ]);
      const api = new GoalAPI(supabase as never);

      const result = await api.checkMilestoneAchievement(milestone);

      expect(result.achieved).toBe(false);
    });

    it("[非退行] 同じ distance/style で swim_category=Swim のログがあれば達成になる", async () => {
      const milestone = createMockMilestone({
        type: "time",
        params: { distance: 100, target_time: 60, style: "Fr", swim_category: "Swim" } as MilestoneTimeParams,
      });
      const supabase = createFilteringPracticeLogsMock([
        { id: "log-kick", user_id: "user-1", style: "Fr", swim_category: "Kick", distance: 100, time: 55 },
        { id: "log-swim", user_id: "user-1", style: "Fr", swim_category: "Swim", distance: 100, time: 58 },
      ]);
      const api = new GoalAPI(supabase as never);

      const result = await api.checkMilestoneAchievement(milestone);

      expect(result.achieved).toBe(true);
      expect(result.achievementData?.practiceLogId).toBe("log-swim");
    });
  });

  describe("hasRecordsForMilestone → hasTimeRecords: swim_category の絞り込み", () => {
    it("practice_logsへの問い合わせに .eq('swim_category', params.swim_category) が含まれる", async () => {
      const milestone = createMockMilestone({
        type: "time",
        status: "not_started",
        params: { distance: 100, target_time: 60, style: "Fr", swim_category: "Swim" } as MilestoneTimeParams,
      });
      const { api, practiceLogs } = createUpdateAllStatusesMock(milestone);

      await api.updateAllMilestoneStatuses("user-1");

      expect(practiceLogs.eqCalls).toContainEqual(["swim_category", "Swim"]);
    });
  });
});
