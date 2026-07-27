/**
 * Android Edge-to-Edge 強制下でのフッター系 paddingBottom 計算。
 *
 * 「デザイン上の基準値 (basePadding, 従来の iOS Home Indicator 想定ハードコード)」と
 * 「実機の safe area inset (insetBottom)」の大きい方を採用する。
 * insetBottom が信頼できない値 (NaN・負値) の場合は basePadding にフォールバックする。
 */
export function getSafeFooterPadding(basePadding: number, insetBottom: number): number {
  if (!Number.isFinite(insetBottom) || insetBottom < 0) {
    return basePadding;
  }
  return Math.max(basePadding, insetBottom);
}
