/**
 * 水泳種目ユーティリティ
 * style_id (DB の styles.id) と next-intl の泳法コードキー (Fr/Ba/Br/Fly/IM) を橋渡しする。
 */

import type { SwimStyle } from "@apps/shared/types";

/**
 * next-intl practice.styles.* / practice.styleAbbrev.* のキー。
 * 値集合が shared の SwimStyle ("Fr"/"Br"/"Ba"/"Fly"/"IM") と完全に一致するため、
 * 独立した型として持たず SwimStyle から導出する (二重管理の禁止)。
 */
export type StyleCodeKey = SwimStyle;

/**
 * DB の styles.id を泳法コードキーに変換する。
 * BulkBestTimeClient の STYLES マスターと同じ ID マッピング。
 * 未知の ID は null を返し、呼び出し側でフォールバックさせる。
 */
export function styleIdToCodeKey(styleId: number | string): StyleCodeKey | null {
  const id = typeof styleId === "string" ? parseInt(styleId, 10) : styleId;
  // id 1-7: 自由形, 8-11: 平泳ぎ, 12-15: 背泳ぎ, 16-19: バタフライ, 20-22: 個人メドレー
  if (id >= 1 && id <= 7) return "Fr";
  if (id >= 8 && id <= 11) return "Br";
  if (id >= 12 && id <= 15) return "Ba";
  if (id >= 16 && id <= 19) return "Fly";
  if (id >= 20 && id <= 22) return "IM";
  return null;
}

/**
 * name_jp 文字列から泳法コードキーを推定する。
 * DB 照合でなく表示用途のフォールバックとして使う。
 */
export function nameJpToCodeKey(nameJp: string): StyleCodeKey | null {
  if (nameJp.includes("自由形")) return "Fr";
  if (nameJp.includes("背泳ぎ")) return "Ba";
  if (nameJp.includes("平泳ぎ")) return "Br";
  if (nameJp.includes("バタフライ")) return "Fly";
  if (nameJp.includes("個人メドレー")) return "IM";
  return null;
}

/**
 * ロケールに応じた「距離 + 泳法名」文字列を組み立てる。
 * ja: "100m自由形", en: "100m Freestyle"
 *
 * @param distance    距離 (数値)
 * @param strokeName  翻訳済みの泳法名 (例: "Freestyle", "自由形")
 * @param locale      現在のロケール
 */
export function buildSwimStyleLabel(
  distance: number,
  strokeName: string,
  locale: string,
): string {
  // 日本語のみスペースなし、それ以外はスペースあり
  if (locale === "ja") {
    return `${distance}m${strokeName}`;
  }
  return `${distance}m ${strokeName}`;
}

/**
 * リレー種目として選択可能かどうか (style_id コードキー × 距離で判定)。
 * StyleChipSelector / RecordLogEntry の両方で使う共通ロジック。
 * QA がこの関数を直接 import してテストできるよう export する。
 *
 * リレー可能条件:
 *   Fr: 25 / 50 / 100 / 200m
 *   Br: 25 / 50 / 100m
 *   Fly: 25 / 50 / 100m
 *   Ba / IM: リレー不可
 */
export function canStyleRelay(styleId: number | string, distance: number): boolean {
  const code = styleIdToCodeKey(styleId);
  if (code === "Fr" && [25, 50, 100, 200].includes(distance)) return true;
  if (code === "Br" && [25, 50, 100].includes(distance)) return true;
  if (code === "Fly" && [25, 50, 100].includes(distance)) return true;
  return false;
}
