// =============================================================================
// result-of-swimming/types.ts
// =============================================================================
// 分析用の生データ型。個人を識別できる情報は一切持たない。
// (swimmer_name / swimmer_code / entry_group は parse 時に破棄する)
//
// 注意: raw 層は可読性のため poolLength を 25|50 で持つ。
//       本番 race_pace_models へは 0|1 (records.pool_type と同一) に変換して出す。
//       変換点は export 層の1箇所だけに閉じる。
// =============================================================================
import type { Stroke, ValidationStatus } from "@shared/racePace";

export type RawGender = "male" | "female" | "unknown";
export type RawStroke = Stroke | "unknown";
export type PoolLength = 25 | 50;

export interface RawSplit {
  distance: number;
  cumulativeTimeMs: number;
  /** 直前 split からの区間タイム。cumulative から導出できるが検算用に持つ */
  lapTimeMs?: number;
}

export interface RawRace {
  /** API の result_id */
  sourceRaceId: string;
  sourceUrl: string;

  competitionName?: string;
  competitionDate?: string;

  gender: RawGender;

  /** 個人の学種 (小学/中学/高校/大学/一般)。実年齢は API から取得できない */
  ageCategory?: string;
  /** 学年。school_class.school_grade */
  schoolGrade?: number[];

  stroke: RawStroke;
  distance: number;
  poolLength: PoolLength;

  /** race_division の名称 (予選/決勝(A-決勝)/タイム決勝 など) */
  round?: string;

  finalTimeMs: number | null;
  splits: RawSplit[];

  /** リレー種目 (swimming_style 6/7)。集計から除外する */
  isRelay: boolean;
  /** API の reason_code: 0=正常, 1=棄権, 2=失格 */
  reasonCode: number | null;

  finaPoint?: number | null;

  validationStatus: ValidationStatus;
  validationReason: string | null;
}
