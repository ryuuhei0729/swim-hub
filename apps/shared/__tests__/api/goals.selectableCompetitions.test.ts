/**
 * apps/shared/__tests__/api/goals.selectableCompetitions.test.ts
 *
 * Sprint Contract 検証観点:
 *   [V-API-06] GoalAPI.getSelectableCompetitions() が個人大会+チーム大会を
 *              対象にクエリを組み立てる (アクセス制御そのものは RLS が担うため、
 *              ここでは「クエリがチーム大会を除外する独自フィルタを持たないこと」
 *              「未来日のみに絞るフィルタは呼び出し側の引数通りに効くこと」を確認する)。
 *   [V-API-07] RecordAPI.getCompetitions() 自体は変更しない (既存のチーム大会
 *              非包含の挙動・既存テストを壊さない)。
 *
 * 注意 (トートロジー回避 / 実装再実装の禁止):
 *   実際のアクセス制御 (「このユーザーは本当にこのチーム大会が見えるか」) は
 *   Postgres RLS (competitions テーブルの SELECT ポリシー) が担う。ユニットテストで
 *   supabase クライアントをモックする以上、RLS の実効性はここでは検証できない
 *   (モックは常に許可された体で応答するため)。RLS の実効性検証は pgTAP 側
 *   (16_goals_rls_and_competition_scope.test.sql) の責務。
 *   → 本ファイルでは「JS側が checklist に反する独自のチームIDフィルタ等を
 *   追加していないか」「startDate/endDate 引数が渡された通りに .gte/.lte に
 *   反映されているか」だけを見る。team_id の有無を JS側でフィルタするアサーションは
 *   書かない (feedback_swimhub_qa_harness_reimplements_production.md 参照)。
 */

import { describe, it, expect, vi } from "vitest";
import { GoalAPI } from "../../api/goals";
import { RecordAPI } from "../../api/records";

type TrackingBuilder = {
  select: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  then: (onFulfilled?: unknown, onRejected?: unknown) => Promise<unknown>;
};

function createCompetitionsTrackingBuilder(data: unknown) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder = {} as TrackingBuilder;
  builder.select = vi.fn((...args: unknown[]) => {
    calls.push({ method: "select", args });
    return builder;
  });
  builder.order = vi.fn((...args: unknown[]) => {
    calls.push({ method: "order", args });
    return builder;
  });
  builder.gte = vi.fn((...args: unknown[]) => {
    calls.push({ method: "gte", args });
    return builder;
  });
  builder.lte = vi.fn((...args: unknown[]) => {
    calls.push({ method: "lte", args });
    return builder;
  });
  builder.then = ((onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve({ data, error: null }).then(onFulfilled, onRejected)) as TrackingBuilder["then"];
  return { builder, calls };
}

describe("GoalAPI.getSelectableCompetitions", () => {
  it(".gte('date', 引数の日付) 相当のフィルタをかけている (既存の GoalCreateModal / GoalEditModal の「未来日のみ」呼び出しを維持)", async () => {
    const { builder, calls } = createCompetitionsTrackingBuilder([]);
    const from = vi.fn((table: string) => {
      if (table === "competitions") return builder;
      throw new Error(`unexpected table: ${table}`);
    });
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from,
    };
    const api = new GoalAPI(supabase as never);

    await api.getSelectableCompetitions("2026-09-29");

    expect(calls).toContainEqual({ method: "gte", args: ["date", "2026-09-29"] });
  });

  it("startDate/endDate を省略した場合は日付フィルタを一切かけない (getGoalDataLoader 等、全件取得したい呼び出し元のための後方互換)", async () => {
    const { builder, calls } = createCompetitionsTrackingBuilder([]);
    const from = vi.fn(() => builder);
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from,
    };
    const api = new GoalAPI(supabase as never);

    await api.getSelectableCompetitions();

    expect(calls.some((c) => c.method === "gte" || c.method === "lte")).toBe(false);
  });

  it("team_id によるクライアント側の除外フィルタを一切追加していない (チーム大会を見せるかどうかは RLS に委譲する設計であることの確認)", async () => {
    const teamCompetition = { id: "comp-team", team_id: "team-1", date: "2026-10-01" };
    const { builder, calls } = createCompetitionsTrackingBuilder([teamCompetition]);
    const from = vi.fn(() => builder);
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from,
    };
    const api = new GoalAPI(supabase as never);

    const result = await api.getSelectableCompetitions("2026-09-29");

    // team_id を対象にした .is / .eq / .neq 等のフィルタ呼び出しが存在しないこと
    // (もし追加されていたら、それは「RLSに委譲する」設計から逆行しているため fail する)。
    expect(
      calls.some((c) => c.args.some((arg) => typeof arg === "string" && arg === "team_id")),
    ).toBe(false);
    // チーム大会の行がそのまま (フィルタされず) 返ってくる。
    expect(result).toEqual([teamCompetition]);
  });

  it("戻り値の型が Competition[] のままである (team_id 付き行が混在しても呼び出し側の型が壊れない)", async () => {
    const rows = [
      { id: "comp-personal", team_id: null, date: "2026-10-01" },
      { id: "comp-team", team_id: "team-1", date: "2026-10-02" },
    ];
    const { builder } = createCompetitionsTrackingBuilder(rows);
    const from = vi.fn(() => builder);
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from,
    };
    const api = new GoalAPI(supabase as never);

    const result = await api.getSelectableCompetitions("2026-09-29");

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual(["comp-personal", "comp-team"]);
  });

  it("未認証の場合はエラーを投げる", async () => {
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      from: vi.fn(),
    };
    const api = new GoalAPI(supabase as never);

    await expect(api.getSelectableCompetitions()).rejects.toThrow("認証が必要です");
  });
});

describe("[非退行] RecordAPI.getCompetitions は変更されない", () => {
  it("RecordAPI.getCompetitions の .or('user_id.eq...,user_id.is.null') 条件が従来のまま (team_id ベースの条件が追加されていない)", async () => {
    const orCalls: unknown[][] = [];
    const builder = {
      select: vi.fn().mockReturnThis(),
      or: vi.fn((...args: unknown[]) => {
        orCalls.push(args);
        return builder;
      }),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const from = vi.fn((table: string) => {
      if (table === "competitions") return builder;
      throw new Error(`unexpected table: ${table}`);
    });
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from,
    };
    const api = new RecordAPI(supabase as never);

    await api.getCompetitions();

    expect(orCalls.length).toBeGreaterThan(0);
    const [orArg] = orCalls[0] as [string];
    expect(orArg).toContain("user_id.eq.");
    expect(orArg).toContain("user_id.is.null");
    expect(orArg).not.toMatch(/team_id/);
  });
});
