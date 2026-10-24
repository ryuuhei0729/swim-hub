// =============================================================================
// racePace/ratios.ts - LAP比率
// =============================================================================

/**
 * LAP比率 = lap_time / final_time。
 * finalTimeMs が 0 以下なら空配列を返す (0除算しない)。
 */
export function lapRatios(lapTimesMs: number[], finalTimeMs: number): number[] {
  if (finalTimeMs <= 0) return [];
  return lapTimesMs.map((ms) => ms / finalTimeMs);
}
