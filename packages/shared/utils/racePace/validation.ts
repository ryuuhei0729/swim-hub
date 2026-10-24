// =============================================================================
// racePace/validation.ts - レースのクレンジング
// =============================================================================
// Phase 0 実測の前提:
//   - lap_distance は長水路/短水路とも常に 50 の倍数 (25m split は存在しない)
//   - reason_code 2=失格 / 1=棄権 は result_time が "" でも lap_detail が入る
//     => タイム欠損より先に失格判定しないと invalid_time に誤分類される
// =============================================================================
import { splitsToLaps } from "./laps";
import type { RaceForValidation, ValidationResult } from "./types";

/** Result of Swimming の LAP 粒度は常に 50m */
export const SPLIT_INTERVAL_M = 50;

/** 計時誤差として許容する lap合計と最終タイムの差 (0.05秒) */
export const LAP_SUM_TOLERANCE_MS = 50;

/** 距離に対して期待される LAP 本数 */
export function expectedLapCount(distance: number): number {
  return Math.max(1, Math.round(distance / SPLIT_INTERVAL_M));
}

const ok: ValidationResult = { status: "valid", reason: null };

export function validateRace(race: RaceForValidation): ValidationResult {
  // 失格・棄権はタイムや LAP の有無より先に判定する
  if (race.reasonCode === 1) {
    return { status: "disqualified", reason: "reason_code=1 (棄権/DNS)" };
  }
  if (race.reasonCode === 2) {
    return { status: "disqualified", reason: "reason_code=2 (失格/DSQ)" };
  }

  if (race.finalTimeMs === null || race.finalTimeMs === undefined || race.finalTimeMs <= 0) {
    return { status: "invalid_time", reason: `finalTimeMs=${race.finalTimeMs}` };
  }

  if (!race.splits || race.splits.length === 0) {
    return { status: "missing_split", reason: "splits が空" };
  }

  const laps = splitsToLaps(race.splits);

  const expected = expectedLapCount(race.distance);
  if (laps.length !== expected) {
    return {
      status: "lap_count_mismatch",
      reason: `distance=${race.distance} は LAP ${expected}本を期待するが ${laps.length}本`,
    };
  }

  // 欠測の途中計時は null ではなく 0 で返ってくる (実測)。
  // 0 を「負のLAP」として報告すると原因が読めないので、欠測として分類する。
  // 途中計時が正当に 0 になることはない (最初の split でも 50m 地点)。
  const missing = race.splits.find((s) => s.cumulativeTimeMs <= 0);
  if (missing) {
    return {
      status: "missing_split",
      reason: `${missing.distance}m の通過タイムが欠測 (0 で返却)`,
    };
  }

  const negative = laps.find((l) => l.lapTimeMs <= 0);
  if (negative) {
    return {
      status: "negative_lap",
      reason: `${negative.distance}m の区間が ${negative.lapTimeMs}ms`,
    };
  }

  const lapSum = laps.reduce((acc, l) => acc + l.lapTimeMs, 0);
  const diff = Math.abs(lapSum - race.finalTimeMs);
  if (diff > LAP_SUM_TOLERANCE_MS) {
    return {
      status: "lap_mismatch",
      reason: `lap合計 ${lapSum}ms と finalTime ${race.finalTimeMs}ms の差が ${diff}ms`,
    };
  }

  return ok;
}
