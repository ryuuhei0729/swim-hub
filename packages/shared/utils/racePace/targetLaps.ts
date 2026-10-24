// =============================================================================
// racePace/targetLaps.ts - 目標タイム -> 理想LAP
// =============================================================================
// 保証:
//   sum(lapTimeMs) === targetTimeMs
//   cumulativeTimeMs は単調増加し、最後の値が targetTimeMs に一致する
// 実現方法:
//   比率を合計1に正規化 -> 最終LAP以外を granularity 単位で丸め ->
//   残余を最終LAPへ全部寄せる。これで granularity や比率の誤差に依らず合計が閉じる。
// =============================================================================
import type {
  GenerateTargetLapsInput,
  GenerateTargetLapsResult,
  Lap,
  RacePaceModel,
  RacePaceModelLap,
} from "./types";

const DEFAULT_GRANULARITY_MS = 10; // centisecond

export function generateTargetLaps({
  targetTimeMs,
  model,
  granularityMs = DEFAULT_GRANULARITY_MS,
}: GenerateTargetLapsInput): GenerateTargetLapsResult {
  const base: GenerateTargetLapsResult = {
    targetTimeMs,
    laps: [],
    sampleCount: model.sampleCount,
  };

  if (targetTimeMs <= 0 || model.laps.length === 0) return base;

  const ratioSum = model.laps.reduce((acc, l) => acc + l.ratioMedian, 0);
  if (ratioSum <= 0) return base;

  const g = Math.max(1, Math.floor(granularityMs));
  const laps: Lap[] = [];
  let allocated = 0;

  // 最終LAP以外を granularity 単位で配分
  for (const lap of model.laps.slice(0, -1)) {
    const normalized = lap.ratioMedian / ratioSum;
    const raw = normalized * targetTimeMs;
    const lapTimeMs = Math.max(g, Math.round(raw / g) * g);
    allocated += lapTimeMs;
    laps.push({
      distance: lap.distance,
      lapTimeMs,
      cumulativeTimeMs: allocated,
    });
  }

  // 最終LAP が残余を吸収する => 合計は必ず targetTimeMs
  const last = model.laps[model.laps.length - 1];
  if (!last) return base; // model.laps.length === 0 は上で return 済みだが、防御的に扱う
  laps.push({
    distance: last.distance,
    lapTimeMs: targetTimeMs - allocated,
    cumulativeTimeMs: targetTimeMs,
  });

  return { ...base, laps };
}

/**
 * 2つの bucket モデルの LAP 比率を centerTimeMs で線形補間する。
 * 範囲外はクランプする (外挿は根拠がないため行わない)。
 */
export function interpolateLapRatios(
  low: RacePaceModel,
  high: RacePaceModel,
  targetTimeMs: number,
): RacePaceModelLap[] {
  const span = high.centerTimeMs - low.centerTimeMs;
  const rawWeight = span === 0 ? 0 : (targetTimeMs - low.centerTimeMs) / span;
  const w = Math.min(Math.max(rawWeight, 0), 1);

  const lerp = (a: number, b: number) => a + (b - a) * w;

  return low.laps.map((lowLap, i) => {
    const highLap = high.laps[i];
    if (!highLap) return lowLap;
    return {
      distance: lowLap.distance,
      ratioMedian: lerp(lowLap.ratioMedian, highLap.ratioMedian),
      ratioP25: lerp(lowLap.ratioP25, highLap.ratioP25),
      ratioP75: lerp(lowLap.ratioP75, highLap.ratioP75),
    };
  });
}
