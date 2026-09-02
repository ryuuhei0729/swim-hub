// =============================================================================
// タイム計算ユーティリティ - Swim Hub共通パッケージ
// =============================================================================

import { TimeEntry } from "../types/ui";
import { parseQuickTime } from "./quickTimeParser";

// 型を再エクスポート
export type { TimeEntry };

// タイム計算用の最小限の型（time フィールドのみ必須）
export type TimeEntryLike = Pick<TimeEntry, "time">;

// =============================================================================
// タイム計算関数
// =============================================================================

export function calcFastest(times: TimeEntryLike[]): number | null {
  const valid = times.map((t) => t.time).filter((t) => typeof t === "number" && t > 0);
  if (valid.length === 0) return null;
  return Math.min(...valid);
}

export function calcAverage(times: TimeEntryLike[]): number | null {
  const valid = times.map((t) => t.time).filter((t) => typeof t === "number" && t > 0);
  if (valid.length === 0) return null;
  return valid.reduce((sum, t) => sum + t, 0) / valid.length;
}

export function calcSum(times: TimeEntryLike[]): number {
  return times
    .map((t) => t.time)
    .filter((t) => typeof t === "number" && t > 0)
    .reduce((sum, t) => sum + t, 0);
}

// =============================================================================
// 時間フォーマット関数
// =============================================================================

/**
 * 秒数を "M:SS.ms" 形式にフォーマット（小数第2位まで）
 *
 * DB のタイム列 (records.time / split_times.split_time / practice_times.time)
 * は numeric(10,2) で 1/100 秒精度のため、表示側もそれに合わせる
 * (formatTimeAverage/formatTimeBest と数値的に同じ丸め方に統一)。
 *
 * @param seconds - 秒数（小数点以下はミリ秒）
 * @returns フォーマットされた時間文字列
 * @example formatTime(65.42) => "1:05.42"
 * @example formatTime(0) => "0.00"
 * @example formatTime(-1) => "0.00"
 */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0.00";
  }
  // 小数第2位で丸めてから分と秒を計算（59.995 → 60.00 → 1:00.00 のケースを正しく処理）
  const rounded = Math.round(seconds * 100) / 100;
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = (rounded % 60).toFixed(2);
  return minutes > 0 ? `${minutes}:${remainingSeconds.padStart(5, "0")}` : remainingSeconds;
}

/**
 * 秒数を短縮形式にフォーマット（空文字対応版、小数第1位まで）
 *
 * @param seconds - 秒数
 * @returns フォーマットされた時間文字列（0の場合は空文字）
 * @example formatTimeShort(65.42) => "1:05.4"
 * @example formatTimeShort(45.67) => "45.7"
 * @example formatTimeShort(0) => ""
 */
export function formatTimeShort(seconds: number): string {
  if (seconds === 0) return "";
  if (!Number.isFinite(seconds) || seconds < 0) return "";

  // 小数第1位で丸めてから分と秒を計算（59.99 → 60.0 → 1:00.0 のケースを正しく処理）
  const rounded = Math.round(seconds * 10) / 10;
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;

  if (minutes > 0) {
    return `${minutes}:${remainingSeconds.toFixed(1).padStart(4, "0")}`;
  }
  return remainingSeconds.toFixed(1);
}

/**
 * 秒数を "M:SS.m" 形式にフォーマット（常に分を表示、小数第1位まで）
 *
 * @param seconds - 秒数
 * @returns フォーマットされた時間文字列
 * @example formatTimeFull(45.67) => "0:45.7"
 * @example formatTimeFull(0) => "0:00.0"
 */
export function formatTimeFull(seconds: number): string {
  if (seconds === 0) return "0:00.0";
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00.0";

  // 小数第1位で丸めてから分と秒を計算（59.99 → 60.0 → 1:00.0 のケースを正しく処理）
  const rounded = Math.round(seconds * 10) / 10;
  const min = Math.floor(rounded / 60);
  const remainingSeconds = (rounded % 60).toFixed(1);

  return `${min}:${remainingSeconds.padStart(4, "0")}`;
}

/**
 * 秒数を "M:SS.ms" 形式にフォーマット（平均値用、小数第2位まで）
 *
 * formatTime の2桁化 (Issue #13) により実装が完全に一致したため、formatTime に
 * 委譲するエイリアスにしてある (CLAUDE.md 「同一のドメイン対応表を2箇所に
 * ハードコードするな」と同じ理由で、丸め方の実体を複数箇所に持たない)。
 * 呼び出し名の意味 (平均値表示であること) を保つために別名として残す。
 *
 * @param seconds - 秒数
 * @returns フォーマットされた時間文字列
 * @example formatTimeAverage(65.42) => "1:05.42"
 * @example formatTimeAverage(45.67) => "45.67"
 * @example formatTimeAverage(0) => "0.00"
 */
export function formatTimeAverage(seconds: number): string {
  return formatTime(seconds);
}

/**
 * 秒数を "M:SS.ms" 形式にフォーマット（ベストタイム/大会記録用、小数第2位まで）
 *
 * formatTime の2桁化 (Issue #13) により実装が完全に一致したため、formatTime に
 * 委譲するエイリアスにしてある (理由は formatTimeAverage のコメント参照)。
 * 呼び出し名の意味 (ベストタイム/大会記録表示であること) を保つために別名として残す。
 *
 * @param seconds - 秒数
 * @returns フォーマットされた時間文字列
 * @example formatTimeBest(65.42) => "1:05.42"
 * @example formatTimeBest(45.67) => "45.67"
 * @example formatTimeBest(0) => "0.00"
 * @example formatTimeBest(-1) => "0.00"
 */
export function formatTimeBest(seconds: number): string {
  return formatTime(seconds);
}

/**
 * 時間の差分をフォーマット
 *
 * @param time1 - 基準タイム（秒）
 * @param time2 - 比較タイム（秒）
 * @returns フォーマットされた差分文字列（+/-付き）
 * @example formatTimeDiff(65.42, 64.00) => "+1.42"
 */
export function formatTimeDiff(time1: number, time2: number): string {
  const diff = time1 - time2;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${diff.toFixed(2)}`;
}

// =============================================================================
// 時間パース関数
// =============================================================================

/**
 * 柔軟な形式の時間文字列を秒数に変換
 *
 * 従来形式（:と.を使用）:
 * - "1:23.45" → 83.45秒 (M:SS.ms)
 * - "1:30" → 90秒 (M:SS)
 * - "23.45" → 23.45秒 (SS.ms)
 *
 * クイック入力形式（-などの区切り）:
 * - "31-2" → 31.20秒 (SS-ms)
 * - "1-05-3" → 65.30秒 (M-SS-ms)
 *
 * @param timeString - 時間文字列
 * @returns 秒数（無効な場合は0）
 */
export function parseTime(timeString: string): number {
  if (!timeString || timeString.trim() === "") return 0;

  const trimmed = timeString.trim();

  // 末尾の 's' を除去
  let cleaned = trimmed;
  if (cleaned.endsWith("s") || cleaned.endsWith("S")) {
    cleaned = cleaned.slice(0, -1);
  }

  // 負の値チェック
  if (cleaned.startsWith("-")) return 0;

  // 従来形式チェック（:と.と数字のみを使用している場合）
  if (/^[\d:.]+$/.test(cleaned)) {
    return parseTraditionalFormat(cleaned);
  }

  // クイック入力形式（その他の区切りを含む場合）
  return parseQuickFormat(cleaned);
}

/**
 * 従来形式をパース（:と.のみ）
 */
function parseTraditionalFormat(cleaned: string): number {
  // "M:SS.ms" or "M:SS" 形式
  if (cleaned.includes(":")) {
    const parts = cleaned.split(":");
    if (parts.length !== 2) return 0;
    const [minutesPart, secondsPart] = parts;
    if (minutesPart === undefined || secondsPart === undefined) return 0; // parts.length === 2 を直前で確認済み

    const minutes = parseInt(minutesPart, 10);
    const seconds = parseFloat(secondsPart);

    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return 0;
    if (minutes < 0 || seconds < 0) return 0;

    return minutes * 60 + seconds;
  }

  // "SS.ms" 形式または純粋な秒数
  const result = parseFloat(cleaned);
  if (!Number.isFinite(result) || result < 0) return 0;
  return result;
}

/**
 * クイック入力形式をパース（任意の区切り文字）
 */
function parseQuickFormat(cleaned: string): number {
  // 数字以外を区切りとして分割
  const parts = cleaned.split(/[^0-9]+/).filter(Boolean);

  // 1パーツ: 秒のみ (例: "30")
  if (parts.length === 1) {
    const [secondsPart] = parts;
    if (secondsPart === undefined) return 0; // parts.length === 1 を直前で確認済み
    const seconds = parseFloat(secondsPart);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
  }

  // 2パーツ: SS-ms (例: "31-2" → 31.20秒)
  if (parts.length === 2) {
    const [secondsPart, msPart] = parts;
    if (secondsPart === undefined || msPart === undefined) return 0; // parts.length === 2 を直前で確認済み
    const seconds = parseInt(secondsPart, 10);
    const msValue = parseInt(msPart, 10);
    // 小数部を正規化（1桁なら×10、2桁以上ならそのまま）
    const ms = msPart.length === 1 ? msValue * 10 : msValue;
    if (!Number.isFinite(seconds) || !Number.isFinite(ms)) return 0;
    if (seconds < 0 || ms < 0) return 0;
    return seconds + ms / 100;
  }

  // 3パーツ: M-SS-ms (例: "1-05-3" → 65.30秒)
  if (parts.length === 3) {
    const [minutesPart, secondsPart, msPart] = parts;
    // parts.length === 3 を直前で確認済み
    if (minutesPart === undefined || secondsPart === undefined || msPart === undefined) return 0;
    const minutes = parseInt(minutesPart, 10);
    const seconds = parseInt(secondsPart, 10);
    const msValue = parseInt(msPart, 10);
    const ms = msPart.length === 1 ? msValue * 10 : msValue;
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || !Number.isFinite(ms)) return 0;
    if (minutes < 0 || seconds < 0 || ms < 0) return 0;
    return minutes * 60 + seconds + ms / 100;
  }

  return 0;
}

/**
 * タイム入力の許容形式（構造ガード用正規表現、web/mobile 共通の正典）:
 *
 *  従来形式  \d+(:\d+)?(\.\d+)?  → "1:23.45" "1:30" "23.45" "30"
 *  クイック式 \d+(-\d+){1,2}     → "31-2" "1-05-3"
 *
 * 末尾 s は許容。多重ドット ("1.23.45")・多重コロン ("1:2:3")・
 * 連続区切り・英字・負値を構造的に弾く。
 */
export const TIME_FORMAT_REGEX = /^(\d+(:\d+)?(\.\d+)?|\d+(-\d+){1,2})s?$/i;

/**
 * 日本語IME由来の全角区切りを ASCII 相当に正規化する（：→: 、。／．→. 、ー等→-）。
 * parseTime は任意の非数字を区切りとして受理するが、TIME_FORMAT_REGEX は
 * ASCII 区切りしか通さないため、構造ガード前にこれを通して全角入力を落とさない。
 */
export function normalizeTimeSeparators(timeString: string): string {
  return timeString
    .replace(/：/g, ":")
    .replace(/[。．]/g, ".")
    .replace(/[ー－−‐]/g, "-");
}

/**
 * 時間文字列を秒数に変換（TIME_FORMAT_REGEX で構造ガードした厳格版、バリデーション用）
 *
 * "1.23.45" が 1.23 秒、"31-2" が 31 秒として誤解釈・誤保存されるのを防ぐ。
 * 構造チェックを通過した入力のみ parseTime に委譲し、0 以下は null を返す。
 *
 * @param timeString - 時間文字列
 * @returns 秒数、または無効な場合はnull
 * @example parseTimeStrict("1:23.45") => 83.45
 * @example parseTimeStrict("31-2") => 31.2 (クイック入力形式)
 * @example parseTimeStrict("1：05。30") => 65.3 (全角区切りは ASCII に正規化)
 * @example parseTimeStrict("1.23.45") => null
 * @example parseTimeStrict("1:2:3") => null
 * @example parseTimeStrict("invalid") => null
 */
export function parseTimeStrict(timeString: string): number | null {
  if (!timeString) return null;
  const trimmed = normalizeTimeSeparators(timeString.trim());
  if (!trimmed) return null;
  if (!TIME_FORMAT_REGEX.test(trimmed)) return null;
  const seconds = parseTime(trimmed);
  return seconds > 0 ? seconds : null;
}

/**
 * タイム入力欄の「不正形式のまま残っている」判定（web 各フォーム共通）。
 * 空・未入力は不正扱いしない。parseTimeFlexible が解釈できない形式のみ true
 * （"1.23.45" 等はクイック解釈で受理されるため不正扱いしない）。
 */
export function isInvalidTimeInput(displayValue: string | undefined): boolean {
  return !!displayValue?.trim() && parseTimeFlexible(displayValue) === null;
}

/**
 * 柔軟版タイムパース（単発タイム入力欄用: ベストタイム・大会レコード・エントリータイム）。
 *
 * まず parseTimeStrict を試し、弾かれた場合はクイック入力と同じ
 * 「数字の間を任意の非数字で区切る」解釈にフォールバックする。
 * 練習タイム入力 (useQuickTimeInput) と同じ入力を受理しつつ、
 * 引き継ぎコンテキスト（十の位・分の引き継ぎ）は使わない。
 *
 * parseTimeStrict が通る入力の解釈は従来と完全に同一。
 * "1.23.45" が 1.23 秒として誤確定される事故は起こらない
 * （クイック解釈で 1:23.45 = 83.45 秒になる）。
 *
 * @example parseTimeFlexible("1:23.45") => 83.45
 * @example parseTimeFlexible("1.23.45") => 83.45 (クイック解釈)
 * @example parseTimeFlexible("1、23、4") => 83.4 (クイック解釈)
 * @example parseTimeFlexible("1分12秒3") => 72.3 (クイック解釈)
 * @example parseTimeFlexible("-23.45") => null (負値の試みは区切り扱いしない)
 * @example parseTimeFlexible("invalid") => null
 */
export function parseTimeFlexible(timeString: string): number | null {
  if (!timeString || !timeString.trim()) return null;
  const trimmed = normalizeTimeSeparators(timeString.trim());
  // 先頭の "-" は「負のタイムの試み」であって区切りではない (parseTime と同じガード)
  if (trimmed.startsWith("-")) return null;
  const strict = parseTimeStrict(trimmed);
  if (strict !== null) return strict;
  const quick = parseQuickTime(trimmed);
  return quick && quick.time > 0 ? quick.time : null;
}

// =============================================================================
// ペース計算関数
// =============================================================================

/**
 * ペース計算（100mあたりのタイム）
 *
 * @param totalTime - 総タイム（秒）
 * @param distance - 距離（メートル）
 * @returns 100mあたりのタイム（秒）
 */
export function calculatePace(totalTime: number, distance: number): number {
  if (distance <= 0) return 0;
  return (totalTime / distance) * 100;
}
