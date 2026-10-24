// =============================================================================
// racePace/stats.ts - 統計関数
// =============================================================================
// percentile は DuckDB の quantile_cont と同じ「線形補間」定義に揃えている。
// 集計を DuckDB SQL 側で行った結果と、この TS 実装の結果が一致する必要がある。
// =============================================================================

/** 空配列では null を返す (0 を返すと統計値を汚す) */
export function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * 線形補間パーセンタイル (DuckDB quantile_cont 互換)。
 * p は 0..1。
 */
export function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  if (xs.length === 1) return xs[0]!; // xs.length === 1 を直前で確認済み

  const sorted = [...xs].sort((a, b) => a - b);
  const pos = Math.min(Math.max(p, 0), 1) * (sorted.length - 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  // pos は Math.min/Math.max で [0, sorted.length-1] にクランプ済みのため、
  // floor/ceil した lower/upper も常に有効な配列インデックスになる
  const lowerValue = sorted[lower]!;
  const upperValue = sorted[upper]!;
  if (lower === upper) return lowerValue;
  return lowerValue + (pos - lower) * (upperValue - lowerValue);
}

export function median(xs: number[]): number | null {
  return percentile(xs, 0.5);
}
