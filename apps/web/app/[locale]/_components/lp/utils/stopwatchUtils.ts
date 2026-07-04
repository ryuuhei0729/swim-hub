/**
 * LP v4.2 Deco Dynamic — ストップウォッチ ユーティリティ
 *
 * 状態遷移と時刻フォーマット。ブラウザ依存なし。純粋関数のみ export する。
 */

export type StopwatchStatus = "READY" | "LIVE" | "FINISH";

export type StopwatchState = {
  status: StopwatchStatus;
  /** 停止時点の経過ミリ秒。READY 時は 0 */
  elapsedMs: number;
};

/**
 * ストップウォッチの状態遷移関数。
 *
 * 遷移ルール:
 *   READY  + "START" → LIVE   (elapsedMs: 0)
 *   LIVE   + "STOP"  → FINISH (elapsedMs: now - t0)
 *   それ以外 → 状態変化なし
 *
 * FINISH からの再起動はない (リロードでリセット)。
 *
 * @param current 現在の状態
 * @param event   "START" | "STOP"
 * @param now     performance.now() 相当の現在時刻
 * @param t0      START 時に記録した開始時刻 (STOP イベント時に渡す)
 */
export function transitionStopwatch(
  current: StopwatchState,
  event: "START" | "STOP",
  now: number,
  t0?: number,
): StopwatchState {
  if (event === "START") {
    // READY 以外は変化なし
    if (current.status !== "READY") return current;
    return { status: "LIVE", elapsedMs: 0 };
  }

  // event === "STOP"
  if (current.status !== "LIVE") return current;
  const elapsed = t0 !== undefined ? now - t0 : 0;
  return { status: "FINISH", elapsedMs: Math.max(0, elapsed) };
}

/**
 * 経過ミリ秒を "mm:ss.cc" 形式に変換する。
 *
 * cc = センチ秒 (1/100秒)、2桁ゼロパディング。
 * 例: 0 → "00:00.00" / 61000 → "01:01.00" / 999 → "00:00.99"
 *
 * @param elapsedMs 経過ミリ秒 (負数はエラーにしない。0 として扱う)
 */
export function formatStopwatchTime(elapsedMs: number): string {
  const ms = Math.max(0, elapsedMs);
  const totalCentiseconds = Math.floor(ms / 10);
  const cc = totalCentiseconds % 100;
  const totalSeconds = Math.floor(ms / 1000);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60);

  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(mm)}:${pad(ss)}.${pad(cc)}`;
}
