// =============================================================================
// racePace/resolve.ts - 条件に合うモデルを選び、理想LAPを返す
// =============================================================================
// 候補 (同一の gender/poolType/stroke/distance/ageCategory) の中から
// 目標タイムに対応する bucket を選ぶ。
//   1. 目標を含む bucket があればそれを使う          -> "exact"
//   2. 無ければ前後の bucket を線形補間する          -> "interpolated"
//   3. 範囲外なら端の bucket にクランプする          -> "nearest"
// 外挿はしない (根拠が無い領域で数字を作らない)。
// 該当が無ければ null を返す (捏造しない)。
// =============================================================================
import { generateTargetLaps, interpolateLapRatios } from "./targetLaps";
import type { Lap, RacePaceModel } from "./types";

export type ResolveSource = "exact" | "interpolated" | "nearest";

export interface ResolveInput {
  /** 同一条件の候補モデル。順序は問わない */
  models: RacePaceModel[];
  targetTimeMs: number;
  /** "interpolate" (既定) = 隙間を補間する / "exact" = 含む bucket のみ */
  strategy?: "interpolate" | "exact";
  granularityMs?: number;
}

export interface ResolveResult {
  targetTimeMs: number;
  laps: Lap[];
  /** 使用したモデルのサンプル数 (補間時は合算) */
  sampleCount: number;
  source: ResolveSource;
  /** 実際に使った bucket。UI で根拠を出せるようにする */
  usedBuckets: Array<{ minTimeMs: number; maxTimeMs: number }>;
}

const bucketOf = (m: RacePaceModel) => ({ minTimeMs: m.minTimeMs, maxTimeMs: m.maxTimeMs });

export function resolveTargetLaps({
  models,
  targetTimeMs,
  strategy = "interpolate",
  granularityMs,
}: ResolveInput): ResolveResult | null {
  if (targetTimeMs <= 0) return null;

  const usable = models.filter((m) => m.laps.length > 0);
  if (usable.length === 0) return null;

  const sorted = [...usable].sort((a, b) => a.centerTimeMs - b.centerTimeMs);

  const build = (
    model: RacePaceModel,
    source: ResolveSource,
    sampleCount: number,
    usedBuckets: Array<{ minTimeMs: number; maxTimeMs: number }>,
  ): ResolveResult => {
    const out = generateTargetLaps({ targetTimeMs, model, granularityMs });
    return { targetTimeMs, laps: out.laps, sampleCount, source, usedBuckets };
  };

  // 1. 目標を含む bucket
  const exact = sorted.find((m) => targetTimeMs >= m.minTimeMs && targetTimeMs <= m.maxTimeMs);
  if (exact) return build(exact, "exact", exact.sampleCount, [bucketOf(exact)]);

  if (strategy === "exact") return null;

  // 2/3. 前後を探す
  const below = [...sorted].reverse().find((m) => m.maxTimeMs < targetTimeMs);
  const above = sorted.find((m) => m.minTimeMs > targetTimeMs);

  // 範囲外 -> 端にクランプ (外挿しない)
  if (!below) {
    const first = sorted[0];
    // sorted は usable (length > 0 を確認済み) のコピーで空になり得ないが、
    // 関数境界を超えた保証は信用しない方針に従う
    if (!first) return null;
    return build(first, "nearest", first.sampleCount, [bucketOf(first)]);
  }
  if (!above) {
    const last = sorted[sorted.length - 1];
    // 同上: sorted は空になり得ないが防御的に扱う
    if (!last) return null;
    return build(last, "nearest", last.sampleCount, [bucketOf(last)]);
  }

  // 隙間 -> 線形補間。LAP本数が違う場合は補間できないので近い方を使う
  if (below.laps.length !== above.laps.length) {
    const nearer =
      Math.abs(targetTimeMs - below.centerTimeMs) <= Math.abs(above.centerTimeMs - targetTimeMs)
        ? below
        : above;
    return build(nearer, "nearest", nearer.sampleCount, [bucketOf(nearer)]);
  }

  const laps = interpolateLapRatios(below, above, targetTimeMs);
  return build(
    { ...below, laps },
    "interpolated",
    below.sampleCount + above.sampleCount,
    [bucketOf(below), bucketOf(above)],
  );
}
