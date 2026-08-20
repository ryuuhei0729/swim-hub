// =============================================================================
// racePace/laps.ts - 累積split -> lap
// =============================================================================
import type { Lap, Split } from "./types";

/**
 * 累積通過タイムから区間タイムを ms 誤差なしで求める。
 * 先頭 split は 0m からの区間として扱う。
 * 異常値 (負の区間) はここでは潰さず、validateRace に判定を委ねる。
 */
export function splitsToLaps(splits: Split[]): Lap[] {
  if (splits.length === 0) return [];

  const sorted = [...splits].sort((a, b) => a.distance - b.distance);
  const laps: Lap[] = [];
  let prevCumulative = 0;

  for (const split of sorted) {
    laps.push({
      distance: split.distance,
      lapTimeMs: split.cumulativeTimeMs - prevCumulative,
      cumulativeTimeMs: split.cumulativeTimeMs,
    });
    prevCumulative = split.cumulativeTimeMs;
  }

  return laps;
}
