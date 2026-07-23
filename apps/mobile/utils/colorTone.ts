/**
 * カレンダー記録色カスタマイズ(カスタム色時)の枠線・文字色を導出するための
 * 色調整ユーティリティ。CalendarDay / DayDetailModal 系コンポーネントで共有する。
 *
 * 背景色のアルファ合成(淡色化)は apps/shared/utils/colorAlpha.ts の hexToRgba を使う。
 * こちらは「ベタ塗りの選択色そのままだと濃すぎる」文字色向けに、hue を保ったまま
 * 暗くする用途のみを担う(mobile 固有の表示ロジックのため apps/shared には置かない)。
 */

/**
 * hex を指定割合だけ暗くする。
 */
export const darkenHex = (hex: string, amount: number): string => {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return hex;
  const num = parseInt(cleaned, 16);
  if (Number.isNaN(num)) return hex;
  const r = Math.max(0, Math.min(255, Math.round(((num >> 16) & 0xff) * (1 - amount))));
  const g = Math.max(0, Math.min(255, Math.round(((num >> 8) & 0xff) * (1 - amount))));
  const b = Math.max(0, Math.min(255, Math.round((num & 0xff) * (1 - amount))));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
};
