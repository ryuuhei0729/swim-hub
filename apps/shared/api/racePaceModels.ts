// =============================================================================
// 理想LAP API - Swim Hub共通パッケージ
// Web/Mobile共通で使用するSupabase API関数
// =============================================================================
// race_pace_models は全ユーザー共通の参照データ (マスタ相当)。
// 書き込みは service_role のバッチのみで、アプリからは SELECT だけ行う。
// =============================================================================

import { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveTargetLaps,
  type Gender,
  type PoolType,
  type RacePaceModel,
  type RacePaceModelLap,
  type ResolveResult,
  type Stroke,
} from "../utils/racePace";

/** 理想LAPを引くための条件 */
export interface RacePaceQuery {
  gender: Gender;
  poolType: PoolType;
  stroke: Stroke;
  distance: number;
  /** 既定 "all"。学種別モデルを使う場合のみ指定 */
  ageCategory?: string;
}

interface RacePaceModelRow {
  gender: string;
  pool_type: number;
  stroke: string;
  distance: number;
  split_interval: number;
  age_category: string;
  min_time_ms: number;
  max_time_ms: number;
  center_time_ms: number;
  sample_count: number;
  laps: RacePaceModelLap[];
}

function toModel(row: RacePaceModelRow): RacePaceModel {
  return {
    gender: row.gender as Gender,
    poolType: row.pool_type as PoolType,
    stroke: row.stroke as Stroke,
    distance: row.distance,
    splitInterval: row.split_interval,
    ageCategory: row.age_category,
    minTimeMs: row.min_time_ms,
    maxTimeMs: row.max_time_ms,
    centerTimeMs: row.center_time_ms,
    sampleCount: row.sample_count,
    // laps は JSONB。順序が保証されない環境でも安全なよう距離で並べ直す
    laps: [...(row.laps ?? [])].sort((a, b) => a.distance - b.distance),
  };
}

export class RacePaceModelAPI {
  constructor(private supabase: SupabaseClient) {}

  /**
   * 条件に合うモデルを bucket 全件取得する。
   * 1条件あたり多くても数十行なので、絞り込みは条件側で行い bucket は全部取る
   * (補間には隣接 bucket が必要なため、目標タイムでの絞り込みはしない)。
   */
  async getModels(query: RacePaceQuery): Promise<RacePaceModel[]> {
    const { data, error } = await this.supabase
      .from("race_pace_models")
      // 連結した文字列を渡すと postgrest-js の型推論が効かなくなるため単一リテラルで書く
      .select(
        "gender, pool_type, stroke, distance, split_interval, age_category, min_time_ms, max_time_ms, center_time_ms, sample_count, laps",
      )
      .eq("gender", query.gender)
      .eq("pool_type", query.poolType)
      .eq("stroke", query.stroke)
      .eq("distance", query.distance)
      .eq("age_category", query.ageCategory ?? "all")
      .order("min_time_ms", { ascending: true });

    if (error) throw error;
    return (data as unknown as RacePaceModelRow[]).map(toModel);
  }

  /**
   * 目標タイムから理想LAPを返す。該当モデルが無ければ null。
   * sum(lapTimeMs) === targetTimeMs が保証される。
   */
  async getTargetLaps(
    query: RacePaceQuery & { targetTimeMs: number },
  ): Promise<ResolveResult | null> {
    const models = await this.getModels(query);
    return resolveTargetLaps({ models, targetTimeMs: query.targetTimeMs });
  }

  /**
   * その条件のモデルが存在するタイム範囲。
   * 「この種目はまだデータがありません」を UI が出せるようにする。
   */
  async getCoverage(
    query: RacePaceQuery,
  ): Promise<{ minTimeMs: number; maxTimeMs: number; bucketCount: number; totalSamples: number } | null> {
    const models = await this.getModels(query);
    if (models.length === 0) return null;
    return {
      minTimeMs: Math.min(...models.map((m) => m.minTimeMs)),
      maxTimeMs: Math.max(...models.map((m) => m.maxTimeMs)),
      bucketCount: models.length,
      totalSamples: models.reduce((a, m) => a + m.sampleCount, 0),
    };
  }
}
