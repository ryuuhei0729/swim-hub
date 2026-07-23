import { TAG_COLORS, getColorForName, getRandomTagColor } from "@apps/shared/constants/tagColors";

/**
 * タグ用プリセットカラー定義
 * 実体は apps/shared/constants/tagColors.ts に集約 (Web/カレンダー記録色カスタマイズと共有)。
 * getRandomTagColor / getColorForName も同一アルゴリズムのため shared 実装を再利用する。
 */
// TAG_COLORS は readonly タプル (as const) のため、既存の呼び出し側 (useState<string> 等) を
// 壊さないよう string[] に明示的に広げる。
export const PRESET_TAG_COLORS: string[] = [...TAG_COLORS];

export { getRandomTagColor, getColorForName };
