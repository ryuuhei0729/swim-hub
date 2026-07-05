/**
 * DB UUID 判定ユーティリティ
 *
 * 同一正規表現を3箇所に重複させないための共通関数。
 */

/**
 * 文字列が DB の UUID 形式かどうかを返す純粋関数。
 *
 * @param id - 判定対象の文字列
 */
export function isDbUuid(id: string | null | undefined): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
