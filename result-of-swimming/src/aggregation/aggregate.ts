// =============================================================================
// aggregation/aggregate.ts - RawRace[] -> RacePaceModel[]
// =============================================================================
// グループ化キー:
//   gender / poolType / stroke / distance / splitInterval / ageCategory / time bucket
//
// 集計は AsyncIterable も受けられる形にしてある。PoC ではメモリ上の配列だが、
// 規模が増えたら Parquet/DuckDB からのストリームに差し替えられる
// (percentile は DuckDB の quantile_cont と同一定義に揃えてある)。
// =============================================================================
import {
  getTimeBucket,
  lapRatios,
  mean,
  median,
  percentile,
  splitsToLaps,
  type PoolType,
  type RacePaceModel,
  type RacePaceModelLap,
  type Stroke,
} from "@shared/racePace";
import type { PoolLength, RawRace } from "../types";

/** これを下回るグループはモデルとして出さない (中央値が無意味になる) */
export const DEFAULT_MIN_SAMPLE_COUNT = 30;

/**
 * LAP がこれ未満のグループはモデルにしない。
 * 50m は途中計時が1点 (=ゴール) しか無く、比率が必ず 1.0 になって
 * 「理想LAP = 目標タイム」という情報量ゼロの行になるため。
 */
export const MIN_LAP_COUNT = 2;

/** Result of Swimming の LAP 粒度 */
export const SPLIT_INTERVAL = 50;

export interface AggregateOptions {
  minSampleCount?: number;
  /**
   * 年齢カテゴリの扱い。
   * 'all'          : 学種で分けない (既定。分けるとサンプルが希薄化する)
   * 'school_class' : 学種ごとに分ける
   */
  ageCategoryMode?: "all" | "school_class";
  bucketConfig?: Record<number, number>;
}

/** raw の 25|50 を records.pool_type と同じ 0|1 へ。変換はここ1箇所だけ */
export function toPoolType(poolLength: PoolLength): PoolType {
  return poolLength === 50 ? 1 : 0;
}

interface Bucket {
  gender: "male" | "female";
  poolType: PoolType;
  stroke: Stroke;
  distance: number;
  ageCategory: string;
  minTimeMs: number;
  maxTimeMs: number;
  centerTimeMs: number;
  /** lapIndex -> 比率のサンプル */
  ratiosByLap: number[][];
  /** lapIndex -> 区間タイム(ms)のサンプル */
  timesByLap: number[][];
  lapDistances: number[];
  sampleCount: number;
}

/**
 * 集計に使えるレースか (ここが唯一の入口フィルタ)。
 * 型述語にして gender/stroke/finalTimeMs の絞り込みを呼び出し元に伝播させる
 * (isAggregatable が検査しているのはこの3フィールドのみ。他は真偽値の確認だけ)。
 * これにより呼び出し側で as Stroke 等の unchecked cast が不要になる。
 */
export function isAggregatable(
  race: RawRace,
): race is RawRace & { gender: "male" | "female"; stroke: Stroke; finalTimeMs: number } {
  return (
    race.validationStatus === "valid" &&
    !race.isRelay &&
    race.finalTimeMs !== null &&
    race.finalTimeMs > 0 &&
    race.gender !== "unknown" &&
    race.stroke !== "unknown" &&
    race.splits.length > 0
  );
}

export function aggregate(
  races: Iterable<RawRace>,
  options: AggregateOptions = {},
): RacePaceModel[] {
  const minSampleCount = options.minSampleCount ?? DEFAULT_MIN_SAMPLE_COUNT;
  const ageMode = options.ageCategoryMode ?? "all";
  const buckets = new Map<string, Bucket>();

  for (const race of races) {
    if (!isAggregatable(race)) continue;

    const finalTimeMs = race.finalTimeMs;
    const laps = splitsToLaps(
      race.splits.map((s) => ({ distance: s.distance, cumulativeTimeMs: s.cumulativeTimeMs })),
    );
    if (laps.length === 0) continue;

    const lapTimes = laps.map((l) => l.lapTimeMs);
    const ratios = lapRatios(lapTimes, finalTimeMs);
    if (ratios.length !== laps.length) continue;

    const poolType = toPoolType(race.poolLength);
    const ageCategory = ageMode === "school_class" ? (race.ageCategory ?? "unknown") : "all";
    const bucket = getTimeBucket(finalTimeMs, race.distance, options.bucketConfig);

    const key = [
      race.gender,
      poolType,
      race.stroke,
      race.distance,
      SPLIT_INTERVAL,
      ageCategory,
      bucket.minTimeMs,
    ].join("|");

    let entry = buckets.get(key);
    if (!entry) {
      entry = {
        gender: race.gender,
        poolType,
        stroke: race.stroke,
        distance: race.distance,
        ageCategory,
        minTimeMs: bucket.minTimeMs,
        maxTimeMs: bucket.maxTimeMs,
        centerTimeMs: bucket.centerTimeMs,
        ratiosByLap: laps.map(() => []),
        timesByLap: laps.map(() => []),
        lapDistances: laps.map((l) => l.distance),
        sampleCount: 0,
      };
      buckets.set(key, entry);
    }

    // LAP 本数が食い違うサンプルは混ぜない (距離はキーに入っているので通常起きない)
    if (entry.lapDistances.length !== laps.length) continue;

    for (let i = 0; i < laps.length; i++) {
      const ratioSamples = entry.ratiosByLap[i];
      const timeSamples = entry.timesByLap[i];
      const ratio = ratios[i];
      const lapTime = lapTimes[i];
      // ratiosByLap/timesByLap は entry 生成時に laps と同じ長さで初期化され(121-134行目)、
      // ratios/lapTimes も同じ laps から導出される(101-103行目)ため理論上ここに来ないが、
      // 4つの独立した配列を添字で対応付けているため防御的にガードする
      if (!ratioSamples || !timeSamples || ratio === undefined || lapTime === undefined) continue;
      ratioSamples.push(ratio);
      timeSamples.push(lapTime);
    }
    entry.sampleCount += 1;
  }

  const models: RacePaceModel[] = [];

  for (const b of buckets.values()) {
    if (b.sampleCount < minSampleCount) continue;
    if (b.lapDistances.length < MIN_LAP_COUNT) continue;

    const laps: RacePaceModelLap[] = b.lapDistances.map((distance, i) => {
      const ratioSamples = b.ratiosByLap[i];
      const timeSamples = b.timesByLap[i];
      if (!ratioSamples || !timeSamples) {
        // ratiosByLap/timesByLap は Bucket 生成時に lapDistances と同じ長さで初期化され、
        // 以後 push でしか変更されない(139行目のガードで長さ不一致は既に continue 済み)ため
        // 理論上ここに来ないが、3つの独立した配列を添字で対応付けているため異常として検知する
        throw new Error(`aggregate: lap sample arrays missing at index ${i}`);
      }
      return {
        distance,
        ratioMedian: median(ratioSamples) as number,
        ratioP25: percentile(ratioSamples, 0.25) as number,
        ratioP75: percentile(ratioSamples, 0.75) as number,
        ratioMean: mean(ratioSamples) as number,
        lapTimeMeanMs: Math.round(mean(timeSamples) as number),
        lapTimeMedianMs: Math.round(median(timeSamples) as number),
      };
    });

    models.push({
      gender: b.gender,
      poolType: b.poolType,
      stroke: b.stroke,
      distance: b.distance,
      splitInterval: SPLIT_INTERVAL,
      ageCategory: b.ageCategory,
      minTimeMs: b.minTimeMs,
      maxTimeMs: b.maxTimeMs,
      centerTimeMs: b.centerTimeMs,
      sampleCount: b.sampleCount,
      laps,
    });
  }

  // 決定的な順序で返す (差分レビューと冪等な upsert のため)
  models.sort(
    (a, z) =>
      a.gender.localeCompare(z.gender) ||
      a.poolType - z.poolType ||
      a.stroke.localeCompare(z.stroke) ||
      a.distance - z.distance ||
      a.ageCategory.localeCompare(z.ageCategory) ||
      a.minTimeMs - z.minTimeMs,
  );

  return models;
}
