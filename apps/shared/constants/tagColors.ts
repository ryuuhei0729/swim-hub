// =============================================================================
// タグ/カレンダー記録色 共通パレット定義 - Swim Hub共通パッケージ
// =============================================================================
// web (TagInput.tsx) / mobile (constants/tagColors.ts) で重複していた
// 10色のパステルパレットと名前ベースの決定的カラー導出ロジックを集約する。
// カレンダー記録色カスタマイズ機能でも同一パレットを再利用する
// (apps/shared/types/calendarColors.ts の Zod enum バリデーション対象)。
// =============================================================================

/** タグ/カレンダー記録色のパステルカラーパレット（10色固定） */
export const TAG_COLORS = [
  "#93C5FD", // 青
  "#7DD3FC", // 水色
  "#86EFAC", // 緑
  "#A3E635", // 黄緑
  "#FCA5A5", // 赤
  "#F9A8D4", // ピンク
  "#FDBA74", // オレンジ
  "#FDE047", // 黄色
  "#C4B5FD", // 紫
  "#D1D5DB", // グレー
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

/**
 * ランダムなタグカラーを取得
 */
export function getRandomTagColor(): TagColor {
  // Math.floor(Math.random() * length) は常に [0, length-1] の整数になるため、
  // TAG_COLORS（固定長10の配列）の範囲外になることはない
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]!;
}

/**
 * タグ名から決定的に色を導出する。
 * 候補プレビューと作成後の色を一致させるため、ランダムではなく名前ベースで決める。
 * web/mobile 間で同名タグが同じ色になるよう、アルゴリズムは変更しないこと。
 */
export function getColorForName(name: string): TagColor {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  // hash は >>> 0 で非負整数に固定されているため、% length の結果は常に [0, length-1] になり
  // TAG_COLORS（固定長10の配列）の範囲外になることはない
  return TAG_COLORS[hash % TAG_COLORS.length]!;
}
