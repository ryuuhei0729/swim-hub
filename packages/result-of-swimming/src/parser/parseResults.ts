// =============================================================================
// parser/parseResults.ts - /results レスポンス -> RawRace[]
// =============================================================================
// 破棄するもの:
//   swimmers.swimmer_name / swimmer_code / entry_group  -> 個人情報
//   graphs                                              -> レスポンスの81%だが用途なし
// 残すもの:
//   swimmers.school_class (学種/学年) = 年齢カテゴリの唯一の手がかり
// =============================================================================
import { parseTimeToMs, splitsToLaps, validateRace } from "@shared/racePace";
import type { PoolLength, RawRace, RawSplit } from "../types";
import { isRelayStyle, toGender, toStroke } from "./enums";

export const API_BASE = "https://result.swim.or.jp/api/v1";

/** URL とレース属性の文脈。crawler が組み立てて parser に渡す */
export interface ResultsContext {
  gameCode: string;
  genderCode: number;
  swimmingStyleCode: number;
  distanceCode: number;
  classCode: number;
  raceDivisionCode: number;
  heat: number;

  distance: number;
  poolLength: PoolLength;
  roundName?: string;
  competitionName?: string;
  competitionDate?: string;
}

export function buildResultsUrl(ctx: ResultsContext): string {
  return (
    `${API_BASE}/games/${ctx.gameCode}` +
    `/results/genders/${ctx.genderCode}` +
    `/swimming_styles/${ctx.swimmingStyleCode}` +
    `/distances/${ctx.distanceCode}` +
    `/classes/${ctx.classCode}` +
    `/race_divisions/${ctx.raceDivisionCode}` +
    `/heats/${ctx.heat}`
  );
}

/** lap_detail[] -> RawSplit[]。passing_time が累積、差分を lapTimeMs に入れる */
function toSplits(lapDetail: unknown): RawSplit[] {
  if (!Array.isArray(lapDetail)) return [];

  const cumulative: { distance: number; cumulativeTimeMs: number }[] = [];
  for (const entry of lapDetail) {
    const distance = Number(entry?.lap_distance);
    const ms = parseTimeToMs(entry?.passing_time?.record);
    if (!Number.isFinite(distance) || ms === null) continue;
    cumulative.push({ distance, cumulativeTimeMs: ms });
  }

  return splitsToLaps(cumulative).map((lap) => ({
    distance: lap.distance,
    cumulativeTimeMs: lap.cumulativeTimeMs,
    lapTimeMs: lap.lapTimeMs,
  }));
}

export function parseResults(response: unknown, ctx: ResultsContext): RawRace[] {
  const rows = (response as { data?: unknown })?.data;
  if (!Array.isArray(rows)) return [];

  const sourceUrl = buildResultsUrl(ctx);
  const isRelay = isRelayStyle(ctx.swimmingStyleCode);
  const races: RawRace[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;

    const finalTimeMs = parseTimeToMs(row.result_time);
    const splits = toSplits(row.lap_detail);
    const reasonCode = row.reason_code ?? null;

    // school_class は fixture 生成時に平坦化しているため両方の位置を見る
    const schoolClass = row.school_class ?? row.swimmers?.school_class ?? null;

    const verdict = validateRace({
      distance: ctx.distance,
      finalTimeMs,
      splits: splits.map((s) => ({ distance: s.distance, cumulativeTimeMs: s.cumulativeTimeMs })),
      reasonCode,
    });

    races.push({
      sourceRaceId: String(row.result_id),
      sourceUrl,
      competitionName: ctx.competitionName,
      competitionDate: row.result_date ?? ctx.competitionDate,
      gender: toGender(ctx.genderCode),
      ageCategory: schoolClass?.name ?? undefined,
      schoolGrade: schoolClass?.school_grade ?? undefined,
      stroke: toStroke(ctx.swimmingStyleCode),
      distance: ctx.distance,
      poolLength: ctx.poolLength,
      round: ctx.roundName,
      finalTimeMs,
      splits,
      isRelay,
      reasonCode,
      finaPoint: row.fina_point ?? null,
      validationStatus: verdict.status,
      validationReason: verdict.reason,
    });
  }

  return races;
}
