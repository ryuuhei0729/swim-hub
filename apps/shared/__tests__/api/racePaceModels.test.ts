// =============================================================================
// racePaceModels.test.ts - race_pace_models の取得と行マッピング
// =============================================================================
// 検証観点:
//   [V-M1] 条件が全て WHERE に効く (別条件のモデルを拾わない)
//   [V-M2] snake_case -> camelCase のマッピングが正しい
//   [V-M3] JSONB の laps を距離昇順に並べ直す (順序を信用しない)
//   [V-M4] age_category は既定 "all"
//   [V-M5] エラーは throw する (静かに空を返さない)
//   [V-M6] getTargetLaps が合計保証つきの LAP を返す
//   [V-M7] getCoverage が対応タイム範囲を返す
// =============================================================================

import { describe, expect, it, vi } from "vitest";
import { RacePaceModelAPI } from "../../api/racePaceModels";

const row = (over: Record<string, unknown> = {}) => ({
  gender: "male",
  pool_type: 1,
  stroke: "fr",
  distance: 100,
  split_interval: 50,
  age_category: "all",
  min_time_ms: 51000,
  max_time_ms: 51999,
  center_time_ms: 51500,
  sample_count: 42,
  laps: [
    { distance: 50, ratioMedian: 0.475, ratioP25: 0.47, ratioP75: 0.48 },
    { distance: 100, ratioMedian: 0.525, ratioP25: 0.52, ratioP75: 0.53 },
  ],
  ...over,
});

/** eq() の呼び出しを記録するクエリビルダ */
function mockSupabase(data: unknown, error: unknown = null) {
  const eqCalls: Array<[string, unknown]> = [];
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn((col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return builder;
  });
  builder.order = vi.fn(() => Promise.resolve({ data, error }));
  const from = vi.fn(() => builder);
  return { supabase: { from } as never, eqCalls, from };
}

const query = { gender: "male", poolType: 1, stroke: "fr", distance: 100 } as const;

describe("RacePaceModelAPI.getModels", () => {
  it("[V-M1][V-M4] 全条件を WHERE に渡す (age_category は既定 all)", async () => {
    const { supabase, eqCalls, from } = mockSupabase([row()]);
    await new RacePaceModelAPI(supabase).getModels(query);

    expect(from).toHaveBeenCalledWith("race_pace_models");
    expect(Object.fromEntries(eqCalls)).toEqual({
      gender: "male",
      pool_type: 1,
      stroke: "fr",
      distance: 100,
      age_category: "all",
    });
  });

  it("[V-M4] age_category を明示すればそれを使う", async () => {
    const { supabase, eqCalls } = mockSupabase([row({ age_category: "高校" })]);
    await new RacePaceModelAPI(supabase).getModels({ ...query, ageCategory: "高校" });
    expect(Object.fromEntries(eqCalls).age_category).toBe("高校");
  });

  it("[V-M2] snake_case を camelCase へ写す", async () => {
    const { supabase } = mockSupabase([row()]);
    const [m] = await new RacePaceModelAPI(supabase).getModels(query);
    expect(m).toMatchObject({
      gender: "male",
      poolType: 1,
      stroke: "fr",
      distance: 100,
      splitInterval: 50,
      ageCategory: "all",
      minTimeMs: 51000,
      maxTimeMs: 51999,
      centerTimeMs: 51500,
      sampleCount: 42,
    });
  });

  it("[V-M3] laps が距離降順で来ても昇順に直す", async () => {
    const reversed = row({
      laps: [
        { distance: 100, ratioMedian: 0.525, ratioP25: 0, ratioP75: 0 },
        { distance: 50, ratioMedian: 0.475, ratioP25: 0, ratioP75: 0 },
      ],
    });
    const { supabase } = mockSupabase([reversed]);
    const [m] = await new RacePaceModelAPI(supabase).getModels(query);
    expect(m.laps.map((l) => l.distance)).toEqual([50, 100]);
  });

  it("[V-M3] laps が null でも落ちない", async () => {
    const { supabase } = mockSupabase([row({ laps: null })]);
    const [m] = await new RacePaceModelAPI(supabase).getModels(query);
    expect(m.laps).toEqual([]);
  });

  it("[V-M5] エラーは throw する", async () => {
    const { supabase } = mockSupabase(null, { message: "permission denied" });
    await expect(new RacePaceModelAPI(supabase).getModels(query)).rejects.toBeTruthy();
  });
});

describe("RacePaceModelAPI.getTargetLaps", () => {
  it("[V-M6] 合計が目標タイムと厳密に一致する", async () => {
    const { supabase } = mockSupabase([row()]);
    const r = await new RacePaceModelAPI(supabase).getTargetLaps({ ...query, targetTimeMs: 51500 });
    expect(r).not.toBeNull();
    expect(r!.laps.reduce((a, l) => a + l.lapTimeMs, 0)).toBe(51500);
    expect(r!.source).toBe("exact");
    expect(r!.sampleCount).toBe(42);
  });

  it("[V-M6] モデルが無ければ null", async () => {
    const { supabase } = mockSupabase([]);
    expect(await new RacePaceModelAPI(supabase).getTargetLaps({ ...query, targetTimeMs: 51500 })).toBeNull();
  });
});

describe("RacePaceModelAPI.getCoverage", () => {
  it("[V-M7] 対応タイム範囲と標本数を返す", async () => {
    const { supabase } = mockSupabase([
      row({ min_time_ms: 51000, max_time_ms: 51999, sample_count: 42 }),
      row({ min_time_ms: 53000, max_time_ms: 53999, sample_count: 30 }),
    ]);
    const c = await new RacePaceModelAPI(supabase).getCoverage(query);
    expect(c).toEqual({ minTimeMs: 51000, maxTimeMs: 53999, bucketCount: 2, totalSamples: 72 });
  });

  it("[V-M7] モデルが無ければ null (0 を返さない)", async () => {
    const { supabase } = mockSupabase([]);
    expect(await new RacePaceModelAPI(supabase).getCoverage(query)).toBeNull();
  });
});
