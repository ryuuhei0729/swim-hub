// =============================================================================
// リアクションタイム検証ユーティリティ - Swim Hub共通パッケージ
// Web/Mobile の RT 入力欄が共用する純粋関数
// =============================================================================

/** RT の下限（リレー引き継ぎのマイナス反応を許容する） */
export const REACTION_TIME_MIN = -1;

/** RT の上限 */
export const REACTION_TIME_MAX = 2;

/**
 * RT 入力として「全体が」10進数表記になっているか。
 *
 * Number.parseFloat は先頭の数値だけを解釈して残りを捨てるため、
 * "0.65abc" → 0.65 / "2e" → 2 / "1.2.3" → 1.2 とゴミ混じりの入力が
 * そのまま正規化を通り抜けて DB に書かれてしまう。全体一致を要求して塞ぐ。
 *
 * 入力途中の文字列 ("", "-", ".", "0." 等) もここで弾かれて空欄に戻る。
 */
const COMPLETE_DECIMAL = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

/**
 * RT 入力文字列を数値へ変換する。数値にならない値・入力途中の値は null。
 *
 * クランプしないので範囲外は範囲外のまま返る。呼び出し側が
 * isReactionTimeInRange で範囲バリデーションエラーを出す画面 (RecordFormScreen) 用。
 */
export function parseReactionTimeInput(value: string | null | undefined): number | null {
  const trimmed = (value ?? "").trim();
  if (!COMPLETE_DECIMAL.test(trimmed)) return null;

  // 桁数が極端に多い入力は Number で Infinity になるため弾く
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * RT 入力文字列を正規化する。
 * 未入力・入力途中・数値にならない値は空欄に戻し、それ以外は
 * 小数第2位に丸めて REACTION_TIME_MIN〜MAX にクランプする。
 * （records.reaction_time は numeric(10,2) なので2桁）
 *
 * web RecordLogEntry の step=0.01 min=-1 max=2 と同一の範囲。
 */
export function normalizeReactionTime(value: string | null | undefined): string {
  const parsed = parseReactionTimeInput(value);
  if (parsed === null) return "";

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
