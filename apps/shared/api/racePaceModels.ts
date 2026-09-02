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
import { toStyleCode } from "../utils/swimStyles";

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

/**
 * DB行 → RacePaceModel。stroke は toStyleCode で canonical 化を検証してから使う
 * (race_pace_models.stroke の CHECK 制約は Fr/Br/Ba/Fly/IM のみを許可しているため
 * 通常は必ず正規化できるはずだが、`as Stroke` の unchecked cast のまま信頼すると
 * CHECK 制約を経由しない値 (手動 UPDATE・将来の投入経路の考慮漏れ等) が
 * 静かに間違った Stroke として下流に流れてしまう)。canonical化できない行は
 * 理想LAP計算から除外し、原因追跡のため console.error で記録する。
 * null を返す行は呼び出し元 (getModels) で除外する。
 */
function toModel(row: RacePaceModelRow): RacePaceModel | null {
  const stroke = toStyleCode(row.stroke);
  if (!stroke) {
    console.error(
      `race_pace_models.stroke が canonical な種目コードに正規化できません (行を除外します): "${row.stroke}"`,
    );
    return null;
  }
  return {
    gender: row.gender as Gender,
    poolType: row.pool_type as PoolType,
    stroke,
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
      // stroke の照合はケース非依存にする (移行期の暫定措置。恒久固定ではない)。
      // race_pace_models.stroke は 20260901000001 でタイトルケースへ移行したが、
      // このテーブルへの書き込みは result-of-swimming の service_role バッチが
      // アプリコードとは別デプロイで行う。ilike が救えるのは「アプリコード
      // (この ilike 版) が先に出て、投入バッチがまだ旧ケーシングで書き込んで
      // いる」方向のみ。逆に「投入バッチが先にタイトルケースへ移行し、
      // 旧アプリコード (.eq 版) がまだ稼働している」場合は救えず、旧コードは
      // 0件・エラーなしで静かに壊れる。正しい手順は「アプリコードを100%
      // ロールアウトしてから投入バッチ/migration側を切り替える」こと。
      // styles.style (apps/shared/api/goals.ts, apps/shared/api/styles.ts) と
      // 同じ理由で ilike にする。result-of-swimming 側の投入コードが完全に
      // タイトルケースへ追従したことを確認できたら .eq に戻す選択肢がある。
      .ilike("stroke", query.stroke)
      .eq("distance", query.distance)
      .eq("age_category", query.ageCategory ?? "all")
      .order("min_time_ms", { ascending: true });

    if (error) throw error;
    return (data as unknown as RacePaceModelRow[])
      .map(toModel)
      .filter((model): model is RacePaceModel => model !== null);
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
