// =============================================================================
// 種目/距離マスター定数 - Swim Hub共通パッケージ
// Web/Mobile のベストタイム表・練習ログ等が共用する種目・距離の定数と純粋関数
// =============================================================================

// DB 照合用の日本語キー (バックエンドの style.name_jp と一致させるため翻訳しない)
export const STYLES = ["自由形", "平泳ぎ", "背泳ぎ", "バタフライ", "個人メドレー"] as const;
export type SwimStyleName = (typeof STYLES)[number];

// 静的距離リスト（50m, 100m, 200m, 400m, 800m）
export const DISTANCES = [50, 100, 200, 400, 800] as const;

// 日本語 style キー → 翻訳キー (practice.styles.* / practice.styleAbbrev.* 等の表示名前空間で使用)
export type StyleTranslationKey = "Fr" | "Br" | "Ba" | "Fly" | "IM";
export const STYLE_KEY_MAP: Record<SwimStyleName, StyleTranslationKey> = {
  自由形: "Fr",
  平泳ぎ: "Br",
  背泳ぎ: "Ba",
  バタフライ: "Fly",
  個人メドレー: "IM",
};

/**
 * ありえない種目/距離の組み合わせかチェック
 * (個人メドレー×50/800、平泳ぎ・背泳ぎ・バタフライ×400/800)
 */
export function isInvalidCombination(style: string, distance: number): boolean {
  if (style === "個人メドレー" && (distance === 50 || distance === 800)) return true;
  if (
    (style === "平泳ぎ" || style === "背泳ぎ" || style === "バタフライ") &&
    (distance === 400 || distance === 800)
  )
    return true;
  return false;
}

/**
 * 各種目の有効な距離リストを取得
 */
export function getDistancesForStyle(style: string): number[] {
  return DISTANCES.filter((distance) => !isInvalidCombination(style, distance));
}
