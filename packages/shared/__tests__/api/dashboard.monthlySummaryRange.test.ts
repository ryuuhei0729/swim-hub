/**
 * DashboardAPI.getMonthlySummary の集計期間が、日本時間の端末・ブラウザでも
 * 「その月の 1 日〜末日」になることを確かめる。
 *
 * 以前は月初・月末をローカル時刻の Date で作ってから toISOString() (UTC) で日付にしていたため、
 * 日本時間では 1 日前にずれ「前月末日〜当月末日の前日」を数えていた (月末日の練習・大会が
 * 数に入らない)。サーバー (UTC) では正しく見えるため、日本時間で走らせて確かめる。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DashboardAPI } from "../../api/dashboard";

// Node は process.env.TZ の変更を実行中に反映する (goals.milestoneCountingRange.test.ts と同じ方式。
// vitest の既定の forks プールが前提)
const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "Asia/Tokyo";
});
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

type RangeCall = { table: string; gte?: string; lte?: string };

/** from(table).select().eq().gte().lte() の期間だけを記録する最小のモック */
function makeSupabase(calls: RangeCall[]): SupabaseClient {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }),
    },
    from: (table: string) => {
      const call: RangeCall = { table };
      calls.push(call);
      const query = {
        select: () => query,
        eq: () => query,
        gte: (_column: string, value: string) => {
          call.gte = value;
          return query;
        },
        lte: (_column: string, value: string) => {
          call.lte = value;
          return Promise.resolve({ count: 0, error: null });
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

describe("DashboardAPI.getMonthlySummary — 集計期間 (日本時間)", () => {
  it("2026年11月 → 練習・大会とも 2026-11-01〜2026-11-30 で数える", async () => {
    const calls: RangeCall[] = [];
    await new DashboardAPI(makeSupabase(calls)).getMonthlySummary(2026, 11);

    expect(calls).toEqual([
      { table: "practices", gte: "2026-11-01", lte: "2026-11-30" },
      { table: "competitions", gte: "2026-11-01", lte: "2026-11-30" },
    ]);
  });

  it("うるう年の2月 (2028年2月) → 末日は 29 日", async () => {
    const calls: RangeCall[] = [];
    await new DashboardAPI(makeSupabase(calls)).getMonthlySummary(2028, 2);

    expect(calls.map((c) => [c.gte, c.lte])).toEqual([
      ["2028-02-01", "2028-02-29"],
      ["2028-02-01", "2028-02-29"],
    ]);
  });
});
