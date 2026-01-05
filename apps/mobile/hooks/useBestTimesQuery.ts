// =============================================================================
// ベストタイム取得用React Queryフック（モバイル版）
// 共有パッケージのフックを再エクスポート（後方互換性のため）
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { UseQueryResult } from '@tanstack/react-query'
import {
  useBestTimesQuery as useBestTimesQueryShared,
  type UseBestTimesQueryOptions
} from '@apps/shared/hooks/queries/records'
import type { BestTime } from '@apps/shared/types/ui'

// 型定義を再エクスポート（後方互換性のため）
export type { BestTime, UseBestTimesQueryOptions }

/**
 * ベストタイム取得クエリ
 * 種目・プール種別ごとの最速タイムを計算
 * 
 * @deprecated 直接 @apps/shared/hooks/queries/records から useBestTimesQuery をインポートしてください
 */
export function useBestTimesQuery(
  supabase: SupabaseClient,
  options: UseBestTimesQueryOptions = {}
): UseQueryResult<BestTime[], Error> {
  return useBestTimesQueryShared(supabase, options)
}
