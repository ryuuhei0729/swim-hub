// =============================================================================
// リアクションタイム検証ユーティリティ - Swim Hub共通パッケージ
// Web/Mobile の RT 入力欄が共用する純粋関数
// =============================================================================

/** RT の下限（リレー引き継ぎのマイナス反応を許容する） */
export const REACTION_TIME_MIN = -1;

/** RT の上限 */
export const REACTION_TIME_MAX = 2;

/** 数値として確定できない入力途中の文字列（空欄へ戻す対象） */
const INCOMPLETE_INPUTS = new Set(["", "-", ".", "-.", "0.", "-0."]);

/**
 * RT 入力文字列を正規化する。
 * 未入力・入力途中・数値にならない値は空欄に戻し、それ以外は
 * 小数第2位に丸めて REACTION_TIME_MIN〜MAX にクランプする。
 * （records.reaction_time は numeric(10,2) なので2桁）
 *
 * web RecordLogEntry の step=0.01 min=-1 max=2 と同一の範囲。
 */
export function normalizeReactionTime(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (INCOMPLETE_INPUTS.has(trimmed)) return "";

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return "";

  const rounded = Math.round(parsed * 100) / 100;
  const clamped = Math.min(REACTION_TIME_MAX, Math.max(REACTION_TIME_MIN, rounded));
  return String(clamped);
}

/**
 * 数値 RT が許容範囲内か判定する。
 * クランプせずバリデーションエラーを出す画面 (RecordFormScreen) 用。
 */
export function isReactionTimeInRange(value: number): boolean {
  return value >= REACTION_TIME_MIN && value <= REACTION_TIME_MAX;
}

/**
 * RT 入力文字列を DB 保存値へ変換する。空欄・無効値は null。
 * blur を経ずに保存された場合でもクランプを効かせる書き込み前の関門。
 */
export function toReactionTimeValue(value: string | null | undefined): number | null {
  const normalized = normalizeReactionTime(value);
  if (normalized === "") return null;
  return Number.parseFloat(normalized);
}
