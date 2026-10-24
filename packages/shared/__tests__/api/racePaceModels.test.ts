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
//   [V-M8] stroke のケーシング移行安全性 (下記 NOTE 参照)
//
// NOTE (Sprint: GitHub Issue #13 種目略称ケーシング統一, 追補まで反映 2026-09-01):
//   当初 `Stroke` (racePace/types.ts) が `SwimStyle` の型エイリアスになりタイトル
//   ケースになった一方、`race_pace_models.stroke` の CHECK 制約は移行対象外だった
//   ため「型はタイトルケースを主張するが実データは小文字」という乖離が生まれる
//   ところだった。PM 裁定によりこのテーブルも追加移行された
//   (supabase/migrations/20260901000001_titlecase_race_pace_models_stroke_column.sql)。
//
//   Developer は toModel() を「canonical化できない stroke の行は除外し
//   console.error で記録する」設計にした (`toStyleCode` で正規化 → 失敗時は
//   null を返し、getModels 側で filter して除外する)。[V-M8] はこの除外ロジックが
//   実際に動くこと、および正規化できる限りは (大文字小文字が何であれ) 除外され
//   ないことを検証する。
//
//   クエリ側も styles.style (goals.ts / styles.ts) と同じ理由で `.eq` ではなく
//   `.ilike` に統一されている (race_pace_models への書き込みは result-of-swimming の
//   service_role バッチが別デプロイで行うため、アプリコードと投入バッチの
//   デプロイ順序に依存して0件化しないようにするため)。
// =============================================================================

import { describe, expect, it, vi } from "vitest";
import { RacePaceModelAPI } from "../../api/racePaceModels";

const row = (over: Record<string, unknown> = {}) => ({
  gender: "male",
  pool_type: 1,
  stroke: "Fr",
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

/** eq()/ilike() の呼び出しを記録するクエリビルダ (どちらのメソッドで呼ばれたかも記録する) */
function mockSupabase(data: unknown, error: unknown = null) {
  const calls: Array<{ method: "eq" | "ilike"; column: string; value: unknown }> = [];
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn((col: string, val: unknown) => {
    calls.push({ method: "eq", column: col, value: val });
    return builder;
  });
  builder.ilike = vi.fn((col: string, val: unknown) => {
    calls.push({ method: "ilike", column: col, value: val });
    return builder;
  });
  builder.order = vi.fn(() => Promise.resolve({ data, error }));
  const from = vi.fn(() => builder);
  const eqCalls = () =>
    Object.fromEntries(calls.filter((c) => c.method === "eq").map((c) => [c.column, c.value]));
  return { supabase: { from } as never, calls, eqCalls, from };
}

const query = { gender: "male", poolType: 1, stroke: "Fr", distance: 100 } as const;

describe("RacePaceModelAPI.getModels", () => {
  it("[V-M1][V-M4] gender/pool_type/distance/age_category は eq で渡る", async () => {
    const { supabase, eqCalls, from } = mockSupabase([row()]);
    await new RacePaceModelAPI(supabase).getModels(query);

    expect(from).toHaveBeenCalledWith("race_pace_models");
    expect(eqCalls()).toEqual({
      gender: "male",
      pool_type: 1,
      distance: 100,
      age_category: "all",
    });
  });

  it("[V-M4] age_category を明示すればそれを使う", async () => {
    const { supabase, eqCalls } = mockSupabase([row({ age_category: "高校" })]);
    await new RacePaceModelAPI(supabase).getModels({ ...query, ageCategory: "高校" });
    expect(eqCalls().age_category).toBe("高校");
  });

  it("[V-M2] snake_case を camelCase へ写す", async () => {
    const { supabase } = mockSupabase([row()]);
    const [m] = await new RacePaceModelAPI(supabase).getModels(query);
    expect(m).toMatchObject({
      gender: "male",
      poolType: 1,
      stroke: "Fr",
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
    // mockSupabase([reversed]) は1行のみ返すため、getModels は必ず1件のモデルを返す
    expect(m!.laps.map((l) => l.distance)).toEqual([50, 100]);
  });

  it("[V-M3] laps が null でも落ちない", async () => {
    const { supabase } = mockSupabase([row({ laps: null })]);
    const [m] = await new RacePaceModelAPI(supabase).getModels(query);
    // mockSupabase は1行のみ返すため、getModels は必ず1件のモデルを返す
    expect(m!.laps).toEqual([]);
  });

  it("[V-M5] エラーは throw する", async () => {
    const { supabase } = mockSupabase(null, { message: "permission denied" });
    await expect(new RacePaceModelAPI(supabase).getModels(query)).rejects.toBeTruthy();
  });

  it("[V-M8] stroke は eq でなく ilike で、値を変換せずに絞り込む (恒久固定・回帰ガード)", async () => {
    const { supabase, calls } = mockSupabase([row()]);
    await new RacePaceModelAPI(supabase).getModels(query);

    const strokeCalls = calls.filter((c) => c.column === "stroke");
    expect(strokeCalls, "stroke への絞り込みが1回も呼ばれていない").toHaveLength(1);
    expect(strokeCalls[0]?.method, "stroke は ilike で絞り込むこと").toBe("ilike");
    expect(strokeCalls[0]?.value).toBe("Fr");

    // eq で stroke が呼ばれていないことも明示的に確認 (逆方向の回帰検知)
    expect(calls.some((c) => c.method === "eq" && c.column === "stroke")).toBe(false);
  });

  // PM 裁定 (2026-09-02, Issue #13 High対応): toStyleCode() は canonical との完全一致と
  // legacy バグが書き込んだ「厳密な全小文字」のみを受理するよう絞り込まれた。
  // race_pace_models.stroke への唯一の書き込み元 (result-of-swimming の STROKE_BY_CODE)
  // は小文字のみを生成するため、移行窓の防御として必要なのは小文字カバレッジのみ。
  // 全大文字 ("FR" 等) は実際に書き込まれた実績が無いうえ、"FR"(フリーリレー略称)との
  // 衝突を避けるため非対応(除外対象)になった。
  it("[V-M8] DB行の stroke が legacy な全小文字(移行前レガシー値, result-of-swimmingの実際の書き込み形式)でも canonical に正規化されて除外されない", async () => {
    const { supabase } = mockSupabase([row({ stroke: "fr" }), row({ stroke: "Fr" })]);
    const models = await new RacePaceModelAPI(supabase).getModels(query);

    expect(models).toHaveLength(2);
    expect(models.map((m) => m.stroke)).toEqual(["Fr", "Fr"]);
  });

  it("[新契約] 全大文字/混在ケーシング(表記ゆれ)の stroke はフリーリレー略称等との衝突を避けるため正規化されず除外される", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { supabase } = mockSupabase([row({ stroke: "Fr" }), row({ stroke: "FR" })]);
      const models = await new RacePaceModelAPI(supabase).getModels(query);

      // "FR" は正規化されず除外され、正常な "Fr" の1件のみ残る
      expect(models).toHaveLength(1);
      expect(models.map((m) => m.stroke)).toEqual(["Fr"]);
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("[V-M8] canonical に正規化できない stroke の行は除外され、他の正常行は影響を受けない (静かに間違った値を通さない)", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { supabase } = mockSupabase([
        row({ stroke: "Fr" }),
        row({ stroke: "backstroke" }), // canonical外の壊れた値
        row({ stroke: "Br", distance: 200 }),
      ]);
      const models = await new RacePaceModelAPI(supabase).getModels(query);

      // 壊れた1件だけが除外され、正常な2件は残る (1件の異常が全体を壊さない)
      expect(models).toHaveLength(2);
      expect(models.map((m) => m.stroke).sort()).toEqual(["Br", "Fr"]);
      // 除外は無言ではなく console.error で追跡可能であること
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
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
