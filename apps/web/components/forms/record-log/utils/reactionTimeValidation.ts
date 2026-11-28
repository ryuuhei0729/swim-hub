import { isReactionTimeInRange, parseReactionTimeInput } from "@apps/shared/utils/reactionTime";

export type ReactionTimeError = "format" | "range";

/**
 * リアクションタイム入力の検査。空欄は未入力として null (エラーなし)。
 * 数値にならない値は "format"、-1〜2秒の範囲外は "range" を返す。
 * mobile の CompetitionTabFormScreen と同じ判定 (クランプせずエラーにする)。
 */
export function getReactionTimeError(value: string | null | undefined): ReactionTimeError | null {
  const raw = (value ?? "").trim();
  if (raw === "") return null;
  const parsed = parseReactionTimeInput(raw);
  if (parsed === null) return "format";
  if (!isReactionTimeInRange(parsed)) return "range";
  return null;
}
