// =============================================================================
// 種目/距離マスター定数 - Swim Hub共通パッケージ
// Web/Mobile のベストタイム表・練習ログ等が共用する種目・距離の定数と純粋関数
// =============================================================================

import type { SwimStyle } from "../types";

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

// 距離接頭辞 (例: "25m", "1500m") を先頭から取り除くための正規表現。
// styles.name_jp の実データは "25m自由形"/"50m自由形"/…/"1500m自由形" のように
// 距離接頭辞つきで格納されているため、STYLES ("自由形" 等の裸名) と直接一致しない。
const DISTANCE_PREFIX_PATTERN = /^\d+m/;

/**
 * 種目カラムのソート用: STYLES 定義順のインデックスを取得
 *
 * 以下のいずれの形式でも一致させる:
 * - 距離接頭辞つき日本語名 (name_jp の実データ, 例: "25m自由形"/"1500m自由形")
 * - 裸の日本語名 (例: "自由形")
 * - 公式略称キー (StyleTranslationKey, 例: "Fr" ※ PracticeLog.style はこちらの形式で保存される)
 *
 * どれにも一致しない場合は -1 を返す（呼び出し側でソート末尾扱いにする想定）。
 */
export function getStyleOrderIndex(styleNameOrKey: string): number {
  const withoutDistancePrefix = styleNameOrKey.replace(DISTANCE_PREFIX_PATTERN, "");
  const byName = STYLES.indexOf(withoutDistancePrefix as SwimStyleName);
  if (byName !== -1) return byName;
  return STYLES.findIndex((style) => STYLE_KEY_MAP[style] === styleNameOrKey);
}

// SwimStyle ("fr"/"br"/"ba"/"fly"/"im") → ロケール非依存の公式英略称
export const STYLE_CODE_TO_ABBREV: Record<SwimStyle, string> = {
  fr: "Fr",
  br: "Br",
  ba: "Ba",
  fly: "Fly",
  im: "IM",
};

// DB name (例: "200IM") の先頭数字直後に "m" を挿入するための正規表現
const LEADING_DIGITS_PATTERN = /^(\d+)/;

/**
 * 種目の距離+略称表示 (例: "200mIM") を組み立てる純粋関数。
 * スマホ幅でフル名 ("200m個人メドレー") の代わりに表示するコンパクトな略称。
 * - style.style / style.distance が揃っていれば `${distance}m${STYLE_CODE_TO_ABBREV[style]}` を組み立てる
 * - 揃わない場合は DB name (例: "200IM") があれば先頭数字直後に "m" を挿入 ("200mIM") して代用
 * - それも無ければ name_jp、最後は "-"
 */
export function formatStyleAbbrev(
  style:
    | { style?: SwimStyle | null; distance?: number | null; name?: string | null; name_jp?: string | null }
    | null
    | undefined,
): string {
  if (!style) return "-";
  if (style.style && style.distance != null) {
    return `${style.distance}m${STYLE_CODE_TO_ABBREV[style.style]}`;
  }
  if (style.name) {
    return style.name.replace(LEADING_DIGITS_PATTERN, "$&m");
  }
  return style.name_jp || "-";
}
