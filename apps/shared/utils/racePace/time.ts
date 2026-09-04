// =============================================================================
// racePace/time.ts - タイム文字列 <-> ms
// =============================================================================
// Result of Swimming (/api/v1) の実測フォーマット:
//   "49.52" (ss.cc) / "3:49.31" (m:ss.cc) / "15:27.00" (mm:ss.cc) / "" (DSQ/DNS)
// 小数部は桁数から桁合わせする (2桁=centisecond, 3桁=millisecond)。
// float 秒を経由すると 0.29 -> 289.999... のような誤差が出るため、
// 全て整数演算で組み立てる。
// =============================================================================

const TIME_PATTERN = /^(?:(\d+):)?(?:(\d{1,2}):)?(\d{1,2})\.(\d{1,3})$/;

/**
 * タイム文字列を ms 整数へ変換する。
 * 変換できない場合は null を返す (0 を返すと欠損と 0.00 秒が区別できなくなる)。
 */
export function parseTimeToMs(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s === "") return null;

  const m = TIME_PATTERN.exec(s);
  if (!m) return null;

  // (\d+):(\d{1,2}):ss.cc の3要素なら h:mm:ss、2要素なら m:ss
  const [, g1, g2, secStr, fracStr] = m;
  let hours = 0;
  let minutes = 0;
  if (g1 !== undefined && g2 !== undefined) {
    hours = Number(g1);
    minutes = Number(g2);
  } else if (g1 !== undefined) {
    minutes = Number(g1);
  }

  const seconds = Number(secStr);
  if (seconds >= 60) return null;
  if (minutes >= 60 && hours > 0) return null;

  // 小数部を ms へ桁合わせ: "5"->500, "52"->520, "523"->523
  // fracStr は TIME_PATTERN の必須キャプチャグループ (g1/g2 のような ?: の外) なので、
  // m がマッチしていれば常に文字列が入る
  const fracMs = Number(fracStr!.padEnd(3, "0"));

  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + fracMs;
}

/**
 * ms を表示用文字列へ。60秒未満は ss.cc、以上は m:ss.cc。
 * centisecond へは切り捨てる (繰り上げて実在しない速いタイムを作らない)。
 */
export function formatMsToTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const totalCs = Math.floor(ms / 10);
  const cs = totalCs % 100;
  const totalSeconds = Math.floor(totalCs / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  const cc = String(cs).padStart(2, "0");
  if (minutes === 0) return `${seconds}.${cc}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${cc}`;
}
