/**
 * マイルストーンの手動完了・達成の確認ダイアログ (達成候補)・タイム目標の統合。
 *
 * 固定する観点:
 *  - setMilestoneCompletion: 完了は achieved + 候補を消す / 未完了に戻すは期限で expired か not_started、
 *    候補を消し candidate_dismissed_at を今にする (戻した記録で再び候補にしない)
 *  - confirmMilestoneAchievement: 達成 + 候補を消し、候補の根拠を milestone_achievements に書く
 *  - dismissMilestoneCandidate: 候補を消し candidate_dismissed_at を今にする
 *  - updateAllMilestoneStatuses: 確認モード (autoAchieve=false) では達成にせず候補を置く /
 *    既存候補は差し替えない / 満たさなくなった候補は取り下げる / 候補ありは期限切れにしない /
 *    自動モード (既定) は従来どおり達成にし、候補があれば消す
 *  - createMilestone / updateMilestone: 旧 time 型は reps_time (1本×1セット) で保存する
 *  - checkMilestoneAchievement: 1本×1セットの reps_time は大会記録でも達成になる、2本以上は大会記録を見ない
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GoalAPI, configureMilestoneJudgment } from "../../api/goals";
import type { Milestone } from "../../types";

type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, string, unknown]> };

/**
 * テーブルごとに応答を差し替えられる簡易 Supabase。全チェーンメソッドを記録し、
 * await (then) / single / maybeSingle で responses[table] を返す。
 */
function fakeSupabase(responses: Record<string, { data?: unknown; error?: unknown }> = {}) {
  const calls: Call[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: vi.fn((table: string) => {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      const result = () => ({ data: responses[table]?.data ?? null, error: responses[table]?.error ?? null });
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: (v: unknown) => ((call.op = "update"), (call.payload = v), chain),
        insert: (v: unknown) => ((call.op = "insert"), (call.payload = v), chain),
        single: async () => result(),
        maybeSingle: async () => result(),
        then: (resolve: (v: unknown) => unknown) => resolve(result()),
      };
      for (const m of ["eq", "neq", "in", "is", "not", "gte", "lte", "gt", "lt", "ilike", "order", "limit"]) {
        chain[m] = (k: string, v: unknown) => (call.filters.push([m, k, v]), chain);
      }
      return chain;
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const NOW = new Date(2026, 10, 3, 12, 0, 0); // 2026-11-03 (ローカル)

function ms(over: Partial<Milestone> = {}): Milestone {
  return {
    id: "m1", goal_id: "g1", title: "t", type: "reps_time",
    params: { distance: 50, reps: 1, sets: 1, target_average_time: 30, style: "Fr", swim_category: "Swim", circle: 0 },
    deadline: null, status: "in_progress", achieved_at: null, reflection_done: false, reflection_note: null,
    achievement_candidate: null, candidate_dismissed_at: null,
    created_at: "2026-10-01T00:00:00Z", updated_at: "", ...over,
  } as Milestone;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  configureMilestoneJudgment({ autoAchieve: true });
  vi.restoreAllMocks();
});

describe("setMilestoneCompletion", () => {
  it("完了: status=achieved / achieved_at=今 / 候補を消す。milestones 以外は触らない", async () => {
    const { client, calls } = fakeSupabase({ milestones: { data: { id: "m1" } } });
    await new GoalAPI(client).setMilestoneCompletion({ id: "m1", deadline: "2026-10-01" }, true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      table: "milestones", op: "update",
      payload: { status: "achieved", achieved_at: NOW.toISOString(), achievement_candidate: null },
      filters: [["eq", "id", "m1"]],
    });
  });

  it.each([
    ["期限なし", null, "not_started"],
    ["期限が未来", "2026-12-01", "not_started"],
    ["期限が今日", "2026-11-03", "not_started"],
    ["期限が過去", "2026-11-02", "expired"],
  ] as const)("未完了に戻す (%s) -> %s、候補を消し candidate_dismissed_at=今", async (_l, deadline, status) => {
    const { client, calls } = fakeSupabase({ milestones: { data: { id: "m2" } } });
    await new GoalAPI(client).setMilestoneCompletion({ id: "m2", deadline }, false);
    expect(calls[0]!.payload).toEqual({
      status, achieved_at: null, achievement_candidate: null, candidate_dismissed_at: NOW.toISOString(),
    });
  });

  it("Supabase のエラーは投げる", async () => {
    const { client } = fakeSupabase({ milestones: { error: { message: "denied" } } });
    await expect(new GoalAPI(client).setMilestoneCompletion({ id: "m1", deadline: null }, true)).rejects.toEqual({
      message: "denied",
    });
  });
});

describe("確認ダイアログ: confirm / dismiss", () => {
  const candidate = {
    practice_log_id: "log-1", record_id: null, achieved_value: { time: 29.5, target_time: 30 }, detected_at: "x",
  };

  it("達成！: achieved + 候補を消し、根拠を milestone_achievements に insert", async () => {
    const { client, calls } = fakeSupabase({ milestones: { data: { id: "m1" } } });
    await new GoalAPI(client).confirmMilestoneAchievement({ id: "m1", achievement_candidate: candidate });
    expect(calls[0]).toMatchObject({
      table: "milestones", op: "update",
      payload: { status: "achieved", achieved_at: NOW.toISOString(), achievement_candidate: null },
    });
    const insert = calls.find((c) => c.table === "milestone_achievements" && c.op === "insert");
    expect(insert?.payload).toEqual({
      milestone_id: "m1", practice_log_id: "log-1", record_id: null, achieved_value: { time: 29.5, target_time: 30 },
    });
  });

  it("達成！: 候補が無ければ milestone_achievements は触らない", async () => {
    const { client, calls } = fakeSupabase({ milestones: { data: { id: "m1" } } });
    await new GoalAPI(client).confirmMilestoneAchievement({ id: "m1", achievement_candidate: null });
    expect(calls.every((c) => c.table === "milestones")).toBe(true);
  });

  it("キャンセル: 候補を消し candidate_dismissed_at=今 (status は変えない)", async () => {
    const { client, calls } = fakeSupabase({ milestones: { data: { id: "m1" } } });
    await new GoalAPI(client).dismissMilestoneCandidate({ id: "m1" });
    expect(calls[0]!.payload).toEqual({ achievement_candidate: null, candidate_dismissed_at: NOW.toISOString() });
  });
});

describe("updateAllMilestoneStatuses: 確認モード (mobile) / 自動モード (web)", () => {
  async function run(milestone: Milestone, achieved: boolean, autoAchieve: boolean) {
    configureMilestoneJudgment({ autoAchieve });
    const { client, calls } = fakeSupabase({ milestones: { data: [milestone] } });
    const api = new GoalAPI(client);
    vi.spyOn(api, "checkMilestoneAchievement").mockResolvedValue(
      achieved
        ? { achieved: true, achievementData: { recordId: "rec-1", achievedValue: { time: 29.9 } } }
        : { achieved: false },
    );
    const statusSpy = vi.spyOn(api, "updateMilestoneStatus").mockResolvedValue(milestone);
    await api.updateAllMilestoneStatuses("u1");
    const updates = calls.filter((c) => c.table === "milestones" && c.op === "update");
    return { updates, statusSpy, calls };
  }

  it("確認モード: 達成にせず候補 (根拠 + detected_at) を置き、未着手は進行中にする", async () => {
    const { updates, statusSpy } = await run(ms({ status: "not_started" }), true, false);
    expect(statusSpy).not.toHaveBeenCalledWith("m1", "achieved", expect.anything());
    expect(updates).toHaveLength(1);
    expect(updates[0]!.payload).toEqual({
      status: "in_progress",
      achievement_candidate: {
        practice_log_id: null, record_id: "rec-1", achieved_value: { time: 29.9 }, detected_at: NOW.toISOString(),
      },
    });
  });

  it("確認モード: 既に候補があれば差し替えない", async () => {
    const existing = { practice_log_id: "old", record_id: null, achieved_value: {}, detected_at: "d" };
    const { updates, statusSpy } = await run(ms({ achievement_candidate: existing }), true, false);
    expect(updates).toHaveLength(0);
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it("確認モード: 候補ありで期限を過ぎていても期限切れにしない", async () => {
    const existing = { practice_log_id: "old", record_id: null, achieved_value: {}, detected_at: "d" };
    const { statusSpy } = await run(ms({ deadline: "2026-10-01", achievement_candidate: existing }), true, false);
    expect(statusSpy).not.toHaveBeenCalledWith("m1", "expired");
  });

  it("満たさなくなった候補は取り下げる", async () => {
    const existing = { practice_log_id: "old", record_id: null, achieved_value: {}, detected_at: "d" };
    const { updates } = await run(ms({ achievement_candidate: existing }), false, false);
    expect(updates.map((u) => u.payload)).toContainEqual({ achievement_candidate: null });
  });

  it("自動モード (既定): 従来どおり achieved にし、根拠を milestone_achievements に書く", async () => {
    const { statusSpy, calls } = await run(ms(), true, true);
    expect(statusSpy).toHaveBeenCalledWith("m1", "achieved", NOW.toISOString());
    expect(calls.some((c) => c.table === "milestone_achievements" && c.op === "insert")).toBe(true);
  });

  it("自動モード: mobile が置いた候補があれば達成と同時に消す", async () => {
    const existing = { practice_log_id: "old", record_id: null, achieved_value: {}, detected_at: "d" };
    const { updates } = await run(ms({ achievement_candidate: existing }), true, true);
    expect(updates[0]!.payload).toEqual({
      status: "achieved", achieved_at: NOW.toISOString(), achievement_candidate: null,
    });
  });

  it("other 型は記録で判定しない (checkMilestoneAchievement を呼ばない)", async () => {
    configureMilestoneJudgment({ autoAchieve: false });
    const { client } = fakeSupabase({ milestones: { data: [ms({ type: "other", params: {} })] } });
    const api = new GoalAPI(client);
    const spy = vi.spyOn(api, "checkMilestoneAchievement");
    await api.updateAllMilestoneStatuses("u1");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("タイム目標 (time) の統合", () => {
  const timeParams = { distance: 100, target_time: 60.5, style: "Fr", swim_category: "Swim" as const };
  const asRepsTime = {
    distance: 100, reps: 1, sets: 1, target_average_time: 60.5, style: "Fr", swim_category: "Swim", circle: 0,
  };

  it("createMilestone: time は reps_time (1本×1セット) で insert", async () => {
    const { client, calls } = fakeSupabase({ milestones: { data: { id: "n" } } });
    await new GoalAPI(client).createMilestone({ goalId: "g1", title: "t", type: "time", params: timeParams });
    expect(calls[0]!.payload).toMatchObject({ type: "reps_time", params: asRepsTime });
  });

  it("updateMilestone: time の params は reps_time (1本×1セット) で update", async () => {
    const { client, calls } = fakeSupabase({ milestones: { data: { id: "m1" } } });
    await new GoalAPI(client).updateMilestone("m1", { type: "time", params: timeParams });
    expect(calls[0]!.payload).toEqual({ type: "reps_time", params: asRepsTime });
  });

  it("判定: 1本×1セットは大会記録 (records) も見る、2本以上は見ない", async () => {
    for (const [reps, expectRecords] of [[1, true], [4, false]] as const) {
      const { client, calls } = fakeSupabase({ practice_logs: { data: [] }, records: { data: [] } });
      await new GoalAPI(client).checkMilestoneAchievement(
        ms({ params: { ...asRepsTime, reps } as Milestone["params"] }),
      );
      expect(calls.some((c) => c.table === "records"), `reps=${reps}`).toBe(expectRecords);
    }
  });

  it("判定: 1本×1セットは大会記録の目標タイム以下で達成 (根拠は record_id)", async () => {
    const { client } = fakeSupabase({ practice_logs: { data: [] }, records: { data: [{ id: "rec-9", time: 60.1 }] } });
    const result = await new GoalAPI(client).checkMilestoneAchievement(ms({ params: asRepsTime as Milestone["params"] }));
    expect(result).toEqual({
      achieved: true,
      achievementData: { recordId: "rec-9", achievedValue: { time: 60.1, target_time: 60.5 } },
    });
  });

  it("判定: キャンセル後はキャンセル日時より後に登録した記録だけを数える", async () => {
    const { client, calls } = fakeSupabase({ practice_logs: { data: [] }, records: { data: [] } });
    await new GoalAPI(client).checkMilestoneAchievement(
      ms({ candidate_dismissed_at: "2026-10-20T00:00:00.000Z", params: asRepsTime as Milestone["params"] }),
    );
    const logs = calls.find((c) => c.table === "practice_logs")!;
    expect(logs.filters).toContainEqual(["gte", "created_at", "2026-10-20T00:00:00.000Z"]);
    expect(logs.filters).toContainEqual(["gte", "practices.date", "2026-10-01"]);
  });
});
