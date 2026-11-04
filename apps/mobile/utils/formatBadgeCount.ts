/** バッジに出す件数の文字列。0 以下なら出さない (undefined)、100 以上は "99+" に丸める */
export function formatBadgeCount(count: number): string | undefined {
  if (count <= 0) return undefined;
  return count > 99 ? "99+" : String(count);
}
