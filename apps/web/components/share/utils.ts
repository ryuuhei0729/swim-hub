// =============================================================================
// シェアカード用ユーティリティ - Swim Hub
// タイムフォーマット、画像生成等のヘルパー関数
// =============================================================================

import { toStyleCode } from "@apps/shared/utils/swimStyles";

/**
 * 秒数をMM:SS.ss形式にフォーマット
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const wholeSecs = Math.floor(secs);
  const hundredths = Math.round((secs - wholeSecs) * 100);

  if (mins > 0) {
    return `${mins}:${wholeSecs.toString().padStart(2, "0")}.${hundredths.toString().padStart(2, "0")}`;
  }
  return `${wholeSecs}.${hundredths.toString().padStart(2, "0")}`;
}

/**
 * リアクションタイムをフォーマット（0.XX形式）
 */
export function formatReactionTime(seconds: number): string {
  return seconds.toFixed(2);
}

/** 自己ベストと同記録とみなす許容誤差（秒）＝コンマ秒未満の浮動小数点誤差を吸収 */
const BEST_EPSILON = 0.005;

/** 自己ベストとの差分を符号付きでフォーマット（改善=マイナス, 同記録=±0, 悪化=プラス） */
export function formatBestDelta(time: number, previousBest: number): string {
  const delta = time - previousBest;
  if (Math.abs(delta) < BEST_EPSILON) return `±${formatTime(0)}`;
  const sign = delta < 0 ? "-" : "+";
  return `${sign}${formatTime(Math.abs(delta))}`;
}

/** シェアカードの自己ベストバッジ状態 */
export type ShareBadgeState =
  | { kind: "first" }
  | { kind: "best"; label: string }
  | { kind: "slower"; label: string }
  | { kind: "none" };

/**
 * 自己ベストバッジの状態を判定する純粋関数。
 * - isFirstRecord=true → 初記録（「初」バッジ）
 * - previousBest が不明 (null/undefined) → 非表示（エラー等で判定不能なとき誤表示を防ぐ）
 * - time <= previousBest(+誤差) → ベスト（±0含む、青）
 * - それ以外 → ベストより遅い（赤）
 */
export function getShareBadgeState(
  time: number,
  previousBest: number | null | undefined,
  isFirstRecord?: boolean,
): ShareBadgeState {
  if (isFirstRecord) return { kind: "first" };
  if (previousBest == null) return { kind: "none" };
  const label = formatBestDelta(time, previousBest);
  return time - previousBest <= BEST_EPSILON
    ? { kind: "best", label }
    : { kind: "slower", label };
}

/**
 * ラップタイムを計算（スプリットタイムから）
 */
export function calculateLapTimes(
  splitTimes: Array<{ distance: number; split_time: number }>,
): Array<{ distance: number; lapTime: number; splitTime: number }> {
  const sorted = [...splitTimes].sort((a, b) => a.distance - b.distance);

  return sorted.map((split, index) => {
    // index > 0 のとき sorted[index - 1] は同一配列内の直前要素であり、
    // map の index は常に sorted.length 未満のため必ず存在する
    const previousSplit = index > 0 ? sorted[index - 1]!.split_time : 0;
    return {
      distance: split.distance,
      lapTime: split.split_time - previousSplit,
      splitTime: split.split_time,
    };
  });
}

/**
 * 距離をフォーマット（1000m以上はkm表記）
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    return km % 1 === 0 ? `${km}km` : `${km.toFixed(1)}km`;
  }
  return `${meters}m`;
}

/**
 * サークルタイムをフォーマット（MM:SS形式）
 */
export function formatCircle(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  if (mins > 0) {
    return `${mins}'${secs.toString().padStart(2, "0")}"`;
  }
  return `${secs}"`;
}

/**
 * 自己ベスト更新幅を計算
 */
export function calculateImprovement(
  newTime: number,
  previousBest: number,
): { seconds: number; percentage: number } {
  const diff = previousBest - newTime;
  const percentage = (diff / previousBest) * 100;

  return {
    seconds: diff,
    percentage,
  };
}

/**
 * HTML要素を画像に変換
 * html-to-imageを使用（lab/oklch等のモダンなCSSカラー関数をサポート）
 */
export async function elementToImage(element: HTMLElement, scale: number = 2): Promise<string> {
  const { toPng } = await import("html-to-image");

  return toPng(element, {
    pixelRatio: scale,
    cacheBust: true,
  });
}

/**
 * HTML要素を画像 Blob に変換
 * Web Share API 用。CSP の connect-src が data: URL を許可しないため、
 * data URL を fetch して Blob 化する方法は使えない。html-to-image の toBlob で直接取得する。
 */
export async function elementToBlob(element: HTMLElement, scale: number = 2): Promise<Blob | null> {
  const { toBlob } = await import("html-to-image");

  return toBlob(element, {
    pixelRatio: scale,
    cacheBust: true,
  });
}

/**
 * 画像をダウンロード
 */
export function downloadImage(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

/**
 * 背景色の明度からタグ文字色（黒/白）を決定する
 */
export function getTagTextColor(backgroundColor: string): string {
  const hex = backgroundColor.replace("#", "");
  if (hex.length < 6) return "#FFFFFF";
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? "#000000" : "#FFFFFF";
}

/**
 * 種目の短縮名を日本語に変換
 */
export function getStyleNameJp(shortName: string): string {
  const styleMap: Record<string, string> = {
    Fr: "自由形",
    Ba: "背泳ぎ",
    Br: "平泳ぎ",
    Fly: "バタフライ",
    IM: "個人メドレー",
    MR: "メドレーリレー",
    FR: "フリーリレー",
  };
  // styleMap は "MR"(メドレーリレー)/"FR"(フリーリレー) という SwimStyle とは別語彙を含む。
  // toStyleCode() は canonical 5値しか返さないため、この完全一致分岐がリレー略称を
  // リレー名に解決する唯一の経路。外すと "FR" が生文字列のまま表示される。消さないこと。
  // 後段の toStyleCode() は practice_logs.style (CHECK 制約の無い自由記述列) 由来の
  // legacy な全小文字行 ("fr" 等) を救済するためのフォールバック。
  if (styleMap[shortName]) return styleMap[shortName];
  const normalized = toStyleCode(shortName);
  return (normalized && styleMap[normalized]) || shortName;
}

/**
 * カテゴリの日本語名を取得
 */
export function getCategoryNameJp(category: string): string {
  const categoryMap: Record<string, string> = {
    Swim: "スイム",
    Pull: "プル",
    Kick: "キック",
  };
  return categoryMap[category] || category;
}
