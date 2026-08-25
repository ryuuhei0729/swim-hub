// =============================================================================
// racePace/types.ts - 目標タイムから理想LAPを算出するための型
// =============================================================================
// 語彙は既存DBに合わせている (新しい語彙を発明しない):
//   stroke   : styles.style の CHECK 制約 ('fr'|'br'|'ba'|'fly'|'im') と同一
//   poolType : records.pool_type と同一 (0=短水路25m, 1=長水路50m)
// タイムは全て milliseconds の整数。float 秒は使わない。
// =============================================================================

/** styles.style と同一の種目コード */
export type Stroke = "fr" | "br" | "ba" | "fly" | "im";

/** records.pool_type と同一。0=短水路(25m), 1=長水路(50m) */
export type PoolType = 0 | 1;

export type Gender = "male" | "female";

/** 累積通過タイム。Result of Swimming の lap_detail[].passing_time に対応 */
export interface Split {
  distance: number;
  cumulativeTimeMs: number;
}

/** 区間タイム。lapTimeMs は直前の split からの差分 */
export interface Lap {
  distance: number;
  lapTimeMs: number;
  cumulativeTimeMs: number;
}

/**
 * クレンジング結果。除外理由が後から確認できるよう status と reason を持つ。
 * lap_count_mismatch / negative_lap は「距離とLAP数の不一致」「負のLAP」に対応。
 */
export type ValidationStatus =
  | "valid"
  | "missing_split"
  | "invalid_time"
  | "lap_mismatch"
  | "lap_count_mismatch"
  | "negative_lap"
  | "disqualified";

export interface ValidationResult {
  status: ValidationStatus;
  reason: string | null;
}

/** 1レース分の検証入力。個人情報は一切含めない */
export interface RaceForValidation {
  distance: number;
  finalTimeMs: number | null;
  splits: Split[];
  /** Result of Swimming の reason_code: 0=正常, 1=棄権, 2=失格 */
  reasonCode?: number | null;
}

/** race_pace_models の1行に対応する LAP 統計 */
export interface RacePaceModelLap {
  distance: number;
  ratioMedian: number;
  ratioP25: number;
  ratioP75: number;
  ratioMean?: number;
  lapTimeMeanMs?: number;
  lapTimeMedianMs?: number;
}

/** race_pace_models の1行 */
export interface RacePaceModel {
  gender: Gender;
  poolType: PoolType;
  stroke: Stroke;
  distance: number;
  /** LAP粒度(m)。Result of Swimming は常に 50 */
  splitInterval: number;
  ageCategory: string;
  minTimeMs: number;
  maxTimeMs: number;
  centerTimeMs: number;
  sampleCount: number;
  laps: RacePaceModelLap[];
}

export interface GenerateTargetLapsInput {
  targetTimeMs: number;
  model: RacePaceModel;
  /**
   * LAP を丸める粒度(ms)。既定 10 = centisecond。
   * UI/DB が numeric(10,2) 秒で保持するため、既定では cs 単位に揃える。
   */
  granularityMs?: number;
}

export interface GenerateTargetLapsResult {
  targetTimeMs: number;
  laps: Lap[];
  sampleCount: number;
}
