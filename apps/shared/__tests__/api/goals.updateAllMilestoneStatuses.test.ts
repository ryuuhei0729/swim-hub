/**
 * apps/shared/__tests__/api/goals.updateAllMilestoneStatuses.test.ts
 *
 * GoalAPI.updateAllMilestoneStatuses は、ユーザーの全アクティブなマイルストーンを
 * 1回の SELECT でまとめて取得した後、1件ずつの判定・ステータス更新
 * (processMilestoneStatusUpdate) を Promise.allSettled で並列に実行する。
 * checkMilestoneAchievement は milestone 行を直接引数で受け取る設計になっており、
 * milestones テーブルへの再取得を行う経路は存在しない (=呼び出し側が誤って
 * per-milestone に再取得を足さない限り、常に一覧取得の1回だけになる)。
 *
 * 本ファイルで固定する観点:
 *  - milestones テーブルへの SELECT が一覧取得の1回だけであり、マイルストーン件数に
 *    応じて増えないこと (将来 processMilestoneStatusUpdate 内で誤って再取得を
 *    足された場合の回帰ガード)
 *  - 複数マイルストーンの判定・更新が並列に実行されること (逐次実行への退行ガード)
 *  - 1件のマイルストーンの判定が例外を投げても、他のマイルストーンの判定・更新は
 *    実行され、achieved に更新されること (Promise.allSettled による分離)
 *
 * トートロジー防止メモ: 実装のロジックをそのままコピーせず、「milestones テーブルへの
 * SELECT 回数」「各マイルストーンの practice_logs 問い合わせの開始タイミング」
 * 「例外を投げたマイルストーン以外の最終ステータス」という観測可能な副作用のみを固定する。
 */
import { describe, expect, it, vi } from "vitest";
import { GoalAPI } from "../../api/goals";
import type { Milestone } from "../../types";

function makeSetMilestone(id: string, distance: number): Milestone {
  return {
    id,
    goal_id: "goal-1",
    title: `${id} タイトル`,
    type: "set",
    params: { distance, style: "Fr", swim_category: "Swim", reps: 4, sets: 1, circle: 90 },
    deadline: null,
    status: "in_progress",
    achieved_at: null,
    reflection_done: false,
    reflection_note: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  };
}

/**
 * `.from(table).select()...` のようなチェーン呼び出しを模す汎用ビルダー。
 * practice_logs は distance ごとに個別の応答 (データ・遅延・エラー) を返せるように
 * `.eq("distance", value)` で捕捉した値をキーに引く。
 */
function createFakeSupabase(options: {
  milestones: Milestone[];
  practiceLogsByDistance: Record<
    number,
    { data?: unknown; error?: unknown; delayMs?: number; throwError?: Error }
  >;
  updateMilestoneStatusSpy?: (id: string, status: string) => void;
  /** milestone_achievements.insert が返すエラー (未指定ならエラー無し = 成功) */
  milestoneAchievementsInsertError?: { code: string; message: string };
}) {
  const fromCalls: Record<string, number> = {};
  const practiceLogsStartTimes: Record<number, number> = {};
  const practiceLogsEndTimes: Record<number, number> = {};
  const statusUpdates: Array<{ id: string; status: string }> = [];

  function makeMilestonesBuilder() {
    let single = false;
    let pendingStatus: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {};
    for (const name of ["select", "in"]) {
      builder[name] = vi.fn(() => builder);
    }
    builder.update = vi.fn((payload: { status?: string }) => {
      pendingStatus = payload?.status;
      return builder;
    });
    builder.eq = vi.fn((col: string, value: unknown) => {
      if (col === "id" && pendingStatus) {
        statusUpdates.push({ id: value as string, status: pendingStatus });
      }
      return builder;
    });
    builder.single = vi.fn(() => {
      single = true;
      return builder;
    });
    builder.then = (resolve: (v: unknown) => void) => {
      // updateMilestoneStatus は .update(...).eq("id", ...).select().single() と
      // チェーンする。.single() を経由した呼び出しは更新後の1行を模した値で
      // 十分 (processMilestoneStatusUpdate は戻り値を使わない)。それ以外
      // (一覧取得: .select(...).eq(...).in(...)) は options.milestones を返す。
      if (single) {
        return resolve({ data: {}, error: null });
      }
      return resolve({ data: options.milestones, error: null });
    };
    return builder;
  }

  function makePracticeLogsBuilder() {
    let currentDistance: number | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {};
    for (const name of ["select", "ilike", "order", "gte", "lte", "limit"]) {
      builder[name] = vi.fn(() => builder);
    }
    builder.eq = vi.fn((col: string, value: unknown) => {
      if (col === "distance") currentDistance = value as number;
      return builder;
    });
    builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      const distance = currentDistance as number;
      practiceLogsStartTimes[distance] = Date.now();
      const canned = options.practiceLogsByDistance[distance] ?? { data: [], error: null };
      const settle = () => {
        practiceLogsEndTimes[distance] = Date.now();
        if (canned.throwError) {
          reject(canned.throwError);
        } else {
          resolve({ data: canned.data ?? [], error: canned.error ?? null });
        }
      };
      if (canned.delayMs) {
        setTimeout(settle, canned.delayMs);
      } else {
        settle();
      }
      return builder;
    };
    return builder;
  }

  function makeUpdateStatusBuilder() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {};
    for (const name of ["update", "eq", "select", "insert"]) {
      builder[name] = vi.fn(() => builder);
    }
    builder.single = vi.fn(() => builder);
    // milestone_achievements の重複チェック (.maybeSingle()) は「まだ存在しない」を
    // 表す null を返す (achievementData の insert 自体は本テストの関心事ではない)。
    builder.maybeSingle = vi.fn(() => builder);
    builder.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    return builder;
  }

  /**
   * milestone_achievements 専用ビルダー。重複チェック (.maybeSingle()) は常に
   * 「まだ存在しない」を返し (null)、.insert() の結果だけを
   * options.milestoneAchievementsInsertError で差し替えられるようにする。
   */
  function makeMilestoneAchievementsBuilder() {
    let isInsert = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {};
    for (const name of ["select", "eq"]) {
      builder[name] = vi.fn(() => builder);
    }
    builder.maybeSingle = vi.fn(() => builder);
    builder.insert = vi.fn(() => {
      isInsert = true;
      return builder;
    });
    builder.then = (resolve: (v: unknown) => void) => {
      if (isInsert && options.milestoneAchievementsInsertError) {
        return resolve({ data: null, error: options.milestoneAchievementsInsertError });
      }
      return resolve({ data: isInsert ? null : null, error: null });
    };
    return builder;
  }

  const supabase = {
    from: vi.fn((table: string) => {
      fromCalls[table] = (fromCalls[table] ?? 0) + 1;
      if (table === "milestones") return makeMilestonesBuilder();
      if (table === "practice_logs") return makePracticeLogsBuilder();
      if (table === "milestone_achievements") return makeMilestoneAchievementsBuilder();
      return makeUpdateStatusBuilder();
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return { supabase, fromCalls, practiceLogsStartTimes, practiceLogsEndTimes, statusUpdates };
}

describe("GoalAPI.updateAllMilestoneStatuses", () => {
  it("マイルストーンが3件あっても、milestones テーブルへの SELECT は一覧取得の1回だけ (N+1にならない)", async () => {
    const milestones = [makeSetMilestone("m1", 100), makeSetMilestone("m2", 200), makeSetMilestone("m3", 300)];
    const { supabase, fromCalls } = createFakeSupabase({
      milestones,
      practiceLogsByDistance: {},
    });

    const api = new GoalAPI(supabase);
    await api.updateAllMilestoneStatuses("user-1");

    expect(fromCalls.milestones).toBe(1);
    // 判定自体 (practice_logs 照会) はマイルストーン件数分 (3件) 走る。
    // ここが増えるのは正しい (判定ロジックそのものであり、一覧の再取得ではない)。
    expect(fromCalls.practice_logs).toBe(3);
  });

  it("複数マイルストーンの判定が並列に実行される (逐次実行への退行ガード)", async () => {
    // 3件それぞれの practice_logs 問い合わせに同じ遅延 (50ms) を与える。
    // 逐次実行 (for ループで await) であれば各問い合わせの開始時刻が約50msずつ
    // ずれるはずだが、並列実行 (Promise.allSettled + map) であれば
    // ほぼ同時に開始される。
    const milestones = [makeSetMilestone("m1", 100), makeSetMilestone("m2", 200), makeSetMilestone("m3", 300)];
    const { supabase, practiceLogsStartTimes } = createFakeSupabase({
      milestones,
      practiceLogsByDistance: {
        100: { data: [], delayMs: 50 },
        200: { data: [], delayMs: 50 },
        300: { data: [], delayMs: 50 },
      },
    });

    const api = new GoalAPI(supabase);
    await api.updateAllMilestoneStatuses("user-1");

    const starts = Object.values(practiceLogsStartTimes);
    expect(starts).toHaveLength(3);
    const spread = Math.max(...starts) - Math.min(...starts);
    // 逐次実行なら少なくとも 50ms×2 = 100ms 以上の開きが出るはず。
    // 並列実行であれば数ms程度に収まる。
    expect(spread).toBeLessThan(40);
  });

  it("1件のマイルストーンの判定が例外を投げても、他のマイルストーンは判定・更新される (achieved になる)", async () => {
    // m2 (distance=200) の practice_logs 問い合わせを例外にする。
    // m1・m3 (distance=100/300) は該当ログありで達成させる。
    const milestones = [makeSetMilestone("m1", 100), makeSetMilestone("m2", 200), makeSetMilestone("m3", 300)];
    const updatedStatuses: Array<{ id: string; status: string }> = [];

    const { supabase, fromCalls } = createFakeSupabase({
      milestones,
      practiceLogsByDistance: {
        100: { data: [{ id: "log-1" }] },
        200: { throwError: new Error("practice_logs query failed") },
        300: { data: [{ id: "log-3" }] },
      },
    });

    // milestones の update 呼び出しを記録する (updateMilestoneStatus の実体は
    // GoalAPI 内部だが、from("milestones").update(...) として観測できる)。
    const originalFrom = supabase.from;
    supabase.from = vi.fn((table: string) => {
      const builder = originalFrom(table);
      if (table === "milestones") {
        const originalUpdate = builder.update;
        builder.update = vi.fn((payload: { status?: string }) => {
          if (payload?.status) {
            // eq("id", ...) の呼び出しから id を後で拾えるよう、update 呼び出し時点の
            // payload だけ記録しておき、直後の eq("id", value) で id を確定させる。
            const chained = originalUpdate(payload);
            const originalEq = chained.eq;
            chained.eq = vi.fn((col: string, value: unknown) => {
              if (col === "id") updatedStatuses.push({ id: value as string, status: payload.status! });
              return originalEq(col, value);
            });
            return chained;
          }
          return originalUpdate(payload);
        });
      }
      return builder;
    });

    const api = new GoalAPI(supabase);
    await api.updateAllMilestoneStatuses("user-1");

    expect(fromCalls.practice_logs).toBe(3);
    const achievedIds = updatedStatuses.filter((u) => u.status === "achieved").map((u) => u.id);
    expect(achievedIds).toEqual(expect.arrayContaining(["m1", "m3"]));
    expect(achievedIds).not.toContain("m2");
  });

  it("milestone_achievements の INSERT が unique violation (23505) で失敗しても、マイルストーンの status は achieved のままで、例外は外に出ない", async () => {
    // updateMilestoneStatus (status: "achieved" への更新) は達成記録の INSERT より
    // 前に実行され別トランザクションで確定する実装のため、INSERT 側が重複エラーに
    // なっても status の確定には影響しない (F1: PM裁定によりコード変更なし。
    // DB 側に部分 UNIQUE インデックスを追加したことで、このエラーコードが
    // 実際に発火しうるようになった)。
    const milestone = makeSetMilestone("m1", 100);
    const { supabase, statusUpdates } = createFakeSupabase({
      milestones: [milestone],
      practiceLogsByDistance: { 100: { data: [{ id: "log-1" }] } },
      milestoneAchievementsInsertError: { code: "23505", message: "duplicate key value violates unique constraint" },
    });

    const api = new GoalAPI(supabase);

    // updateAllMilestoneStatuses 自体が例外を投げずに完了すること。
    await expect(api.updateAllMilestoneStatuses("user-1")).resolves.toBeUndefined();

    // ステータス自体は achieved に更新されている (INSERT の失敗とは独立)。
    expect(statusUpdates).toEqual(expect.arrayContaining([{ id: "m1", status: "achieved" }]));
  });
});
