/**
 * タイムフォーマット関数
 * 秒数を「分:秒.小数」形式に変換
 */
export const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds % 60).toFixed(2);
  return minutes > 0 ? `${minutes}:${remainingSeconds.padStart(5, "0")}` : remainingSeconds;
};

/**
 * サークルタイムフォーマット関数
 * 秒数を「分'秒"」形式に変換（例: 125秒 → 2'05"）
 */
export const formatCircleTime = (seconds: number | null): string => {
  if (!seconds) return "-";
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}'${secs.toString().padStart(2, "0")}"`;
};

/**
 * 泳法スタイル定数
 * value: DBに保存される値, label: 表示用日本語名
 */
export const SWIM_STYLES = [
  { value: "Fr", label: "自由形" },
  { value: "Ba", label: "背泳ぎ" },
  { value: "Br", label: "平泳ぎ" },
  { value: "Fly", label: "バタフライ" },
  { value: "IM", label: "個人メドレー" },
] as const;

export { formatTimeAverage, formatTimeBest } from "@apps/shared/utils/time";

/**
 * 色の明度に基づいてテキスト色を決定
 */
export const getTextColorForBackground = (backgroundColor: string): string => {
  const hex = backgroundColor.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? "#000000" : "#FFFFFF";
};

export const getStyleLabel = (styleValue: string | null | undefined): string => {
  if (!styleValue) return "不明";
  const style = SWIM_STYLES.find((s) => s.value === styleValue);
  if (style) return style.label;
  // すでに日本語名の場合はそのまま返す
  if (SWIM_STYLES.some((s) => s.label === styleValue)) return styleValue;
  return styleValue;
};
