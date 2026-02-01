// =============================================================================
// Supabase データ変換ヘルパー関数
// =============================================================================

/**
 * Supabaseのリレーション結果を単一オブジェクトに正規化
 * Supabaseは結合結果を配列または単一オブジェクトで返すことがあるため、
 * この関数で統一的に単一オブジェクトを取得できる
 *
 * @param value - Supabaseから返されたリレーション結果
 * @returns 単一オブジェクト、または null
 * @example
 * const style = normalizeRelation(record.styles) // Style | null
 * const competition = normalizeRelation(record.competitions) // Competition | null
 */
export function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

/**
 * Supabaseのリレーション結果を配列に正規化
 * 単一オブジェクトまたは配列を、常に配列として取得できる
 *
 * @param value - Supabaseから返されたリレーション結果
 * @returns 配列（空配列の可能性あり）
 * @example
 * const milestones = normalizeRelationArray(goal.milestones) // Milestone[]
 */
export function normalizeRelationArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return []
  return Array.isArray(value) ? value : [value]
}
