// =============================================================================
// export/toSupabase.ts - RacePaceModel -> Supabase 投入用 SQL
// =============================================================================
// 依存ゼロを保つため supabase-js は使わず SQL を生成する
// (既存 scraping/generate_insert_sql.js と同じ方針)。
// 自然キーでの upsert なので何度流しても同じ状態に収束する。
// =============================================================================
import type { RacePaceModel } from "@shared/racePace";

/** SQL 文字列リテラルとしてクォートする */
function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** JSONB リテラル。数値は有限であることを保証してから埋める */
function lapsLiteral(model: RacePaceModel): string {
  const laps = model.laps.map((l) => {
    for (const [key, v] of Object.entries(l)) {
      if (typeof v === "number" && !Number.isFinite(v)) {
        throw new Error(`${key} が有限数でない (distance=${l.distance})`);
      }
    }
    return {
      distance: l.distance,
      ratioMedian: l.ratioMedian,
      ratioP25: l.ratioP25,
      ratioP75: l.ratioP75,
      ratioMean: l.ratioMean,
      lapTimeMeanMs: l.lapTimeMeanMs,
      lapTimeMedianMs: l.lapTimeMedianMs,
    };
  });
  return `${lit(JSON.stringify(laps))}::jsonb`;
}

export function toUpsertSql(models: RacePaceModel[]): string {
  if (models.length === 0) {
    return "-- 出力対象のモデルがありません\n";
  }

  const rows = models.map((m) =>
    [
      lit(m.gender),
      String(m.poolType),
      lit(m.stroke),
      String(m.distance),
      String(m.splitInterval),
      lit(m.ageCategory),
      String(m.minTimeMs),
      String(m.maxTimeMs),
      String(m.centerTimeMs),
      String(m.sampleCount),
      lapsLiteral(m),
    ].join(", "),
  );

  return [
    "-- =============================================================================",
    "-- race_pace_models 投入 (自然キーで upsert / 冪等)",
    `-- 生成: ${models.length} モデル`,
    "-- =============================================================================",
    "BEGIN;",
    "",
    "INSERT INTO public.race_pace_models (",
    "  gender, pool_type, stroke, distance, split_interval, age_category,",
    "  min_time_ms, max_time_ms, center_time_ms, sample_count, laps",
    ") VALUES",
    rows.map((r) => `  (${r})`).join(",\n"),
    "ON CONFLICT (gender, pool_type, stroke, distance, split_interval, age_category, min_time_ms)",
    "DO UPDATE SET",
    "  max_time_ms = EXCLUDED.max_time_ms,",
    "  center_time_ms = EXCLUDED.center_time_ms,",
    "  sample_count = EXCLUDED.sample_count,",
    "  laps = EXCLUDED.laps,",
    "  generated_at = now();",
    "",
    "COMMIT;",
    "",
  ].join("\n");
}

/** supabase-js で流す場合の行 (将来 API 経由に切り替える用) */
export function toRows(models: RacePaceModel[]) {
  return models.map((m) => ({
    gender: m.gender,
    pool_type: m.poolType,
    stroke: m.stroke,
    distance: m.distance,
    split_interval: m.splitInterval,
    age_category: m.ageCategory,
    min_time_ms: m.minTimeMs,
    max_time_ms: m.maxTimeMs,
    center_time_ms: m.centerTimeMs,
    sample_count: m.sampleCount,
    laps: m.laps,
  }));
}
