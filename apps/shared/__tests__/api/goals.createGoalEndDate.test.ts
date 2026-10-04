// v7: GoalAPI.createGoal は新規大会の INSERT に end_date を渡す (引数を厳密に assert)。
// 壊したら赤: end_date を渡さない / 未指定を undefined のまま (null でない) にする / 既存大会 ID 指定時に大会を INSERT する
import { describe, expect, it, vi } from "vitest";
import { GoalAPI } from "../../api/goals";

function setup() {
  const inserts: Record<string, unknown[]> = { competitions: [], goals: [] };
  const from = vi.fn((table: string) => {
    if (table === "competitions") {
      return {
        insert: vi.fn((v: unknown) => { inserts.competitions!.push(v); return { select: () => ({ single: async () => ({ data: { id: "newc" }, error: null }) }) }; }),
      };
    }
    if (table === "goals") {
      return {
        insert: vi.fn((v: unknown) => { inserts.goals!.push(v); return { select: () => ({ single: async () => ({ data: { id: "g1" }, error: null }) }) }; }),
      };
    }
    // records (ベストタイム自動取得): 該当なし
    const b: Record<string, unknown> = {};
    for (const k of ["select", "eq", "order", "limit"]) b[k] = () => b;
    b.single = async () => ({ data: null, error: { code: "PGRST116" } });
    return b;
  });
  const supabase = { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } } as never;
  return { api: new GoalAPI(supabase), inserts };
}
const base = { userId: "u1", styleId: 1, targetTime: 60, startTime: 70 };

describe("createGoal 新規大会の end_date", () => {
  it("endDate 指定: 大会 INSERT が {title,date,end_date,place,pool_type} を持つ", async () => {
    const { api, inserts } = setup();
    await api.createGoal({ ...base, competitionData: { title: "新規杯", date: "2099-12-31", endDate: "2100-01-02", place: "プール", poolType: 1 } });
    expect(inserts.competitions).toHaveLength(1);
    expect(inserts.competitions![0]).toMatchObject({ title: "新規杯", date: "2099-12-31", end_date: "2100-01-02", place: "プール", pool_type: 1 });
  });

  it("endDate 未指定 / null: end_date は null (undefined ではない)", async () => {
    const a = setup();
    await a.api.createGoal({ ...base, competitionData: { title: "x", date: "2099-12-31", place: null, poolType: 0 } });
    expect((a.inserts.competitions![0] as Record<string, unknown>).end_date).toBeNull();
    const b = setup();
    await b.api.createGoal({ ...base, competitionData: { title: "x", date: "2099-12-31", endDate: null, place: null, poolType: 0 } });
    expect((b.inserts.competitions![0] as Record<string, unknown>).end_date).toBeNull();
  });

  it("既存大会 ID を指定した場合は大会を INSERT しない", async () => {
    const { api, inserts } = setup();
    await api.createGoal({ ...base, competitionId: "c1" });
    expect(inserts.competitions).toHaveLength(0);
  });
});
